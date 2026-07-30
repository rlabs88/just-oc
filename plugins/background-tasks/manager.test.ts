import { describe, expect, test } from "bun:test"
import { SessionBackgroundManager, type BackgroundManagerClient } from "./features/background-agent/manager"
import { extractText } from "./shared/dispatch"

type Deferred = { resolve: (text: string) => void; reject: (error: Error) => void }

function fakeClient(options: { failCreate?: boolean; defer?: boolean } = {}) {
  const aborted: string[] = []
  const prompted: Array<{ sessionID: string; agent?: string }> = []
  const notifications: Array<{ sessionID: string; text: string }> = []
  let counter = 0
  let pending: Deferred | undefined

  const client: BackgroundManagerClient = {
    session: {
      async create() {
        if (options.failCreate) return { error: new Error("no server") }
        return { data: { id: `child_${++counter}` } }
      },
      async prompt(args) {
        prompted.push({ sessionID: args.path.id, agent: args.body.agent })
        if (!options.defer) {
          return { data: { parts: [{ type: "text", text: "the result" }] } }
        }
        return new Promise((resolve, reject) => {
          pending = {
            resolve: (text) => resolve({ data: { parts: [{ type: "text", text }] } }),
            reject,
          }
        })
      },
      async abort(args) {
        aborted.push(args.path.id)
        return {}
      },
      async promptAsync(args) {
        notifications.push({
          sessionID: args.path.id,
          text: args.body.parts[0]?.text ?? "",
        })
        return {}
      },
    },
  }

  return { client, aborted, prompted, notifications, settle: () => pending! }
}

const launchInput = {
  description: "explore the auth flow",
  prompt: "read the auth module and report",
  agent: "explore",
  parentSessionID: "parent_1",
  parentMessageID: "msg_1",
}

/** Let the manager's un-awaited settle() run. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("launch", () => {
  test("opens a real child session and reports its id", async () => {
    const { client } = fakeClient()
    const task = await new SessionBackgroundManager(client).launch(launchInput)

    expect(task.sessionID).toBe("child_1")
    expect(task.status).toBe("running")
  })

  test("records the result when the prompt settles", async () => {
    const { client, notifications } = fakeClient()
    const manager = new SessionBackgroundManager(client)
    const task = await manager.launch(launchInput)

    await tick()
    expect(manager.getTask(task.id)?.status).toBe("completed")
    expect(manager.getTask(task.id)?.result).toBe("the result")
    expect(notifications).toEqual([
      {
        sessionID: "parent_1",
        text: expect.stringContaining(`<system-reminder>\nBackground task "${task.id}" completed.`),
      },
    ])
  })

  test("returns before the prompt completes", async () => {
    const { client, settle } = fakeClient({ defer: true })
    const manager = new SessionBackgroundManager(client)
    const task = await manager.launch(launchInput)

    expect(task.status).toBe("running")
    expect(manager.getTask(task.id)?.result).toBeUndefined()

    settle().resolve("late result")
    await tick()
    expect(manager.getTask(task.id)?.status).toBe("completed")
  })

  test("a failed session creation is recorded, not thrown", async () => {
    const { client } = fakeClient({ failCreate: true })
    const task = await new SessionBackgroundManager(client).launch(launchInput)

    expect(task.status).toBe("error")
    expect(task.error).toContain("no server")
    expect(task.sessionID).toBeUndefined()
  })

  test("a failed prompt is recorded as an error", async () => {
    const { client, notifications, settle } = fakeClient({ defer: true })
    const manager = new SessionBackgroundManager(client)
    const task = await manager.launch(launchInput)

    settle().reject(new Error("provider exploded"))
    await tick()

    expect(manager.getTask(task.id)?.status).toBe("error")
    expect(manager.getTask(task.id)?.error).toContain("provider exploded")
    expect(notifications).toEqual([
      {
        sessionID: "parent_1",
        text: expect.stringContaining(`<system-reminder>\nBackground task "${task.id}" failed:`),
      },
    ])
  })
})

describe("cancel", () => {
  test("aborts the child session and marks the task cancelled", async () => {
    const { client, aborted, settle } = fakeClient({ defer: true })
    const manager = new SessionBackgroundManager(client)
    const task = await manager.launch(launchInput)

    const cancelled = await manager.cancelTask(task.id, {
      source: "test",
      abortSession: true,
    })

    expect(cancelled).toBe(true)
    expect(aborted).toEqual(["child_1"])
    expect(manager.getTask(task.id)?.status).toBe("cancelled")

    // A late completion must not overwrite the cancellation.
    settle().resolve("too late")
    await tick()
    expect(manager.getTask(task.id)?.status).toBe("cancelled")
  })

  test("refuses to cancel a task that already settled", async () => {
    const { client } = fakeClient()
    const manager = new SessionBackgroundManager(client)
    const task = await manager.launch(launchInput)
    await tick()

    expect(await manager.cancelTask(task.id, { source: "test" })).toBe(false)
  })

  test("an unknown task id is not cancellable", async () => {
    const { client } = fakeClient()
    expect(await new SessionBackgroundManager(client).cancelTask("nope", { source: "test" })).toBe(
      false,
    )
  })
})

describe("descendants", () => {
  test("are scoped to the parent session", async () => {
    const { client } = fakeClient()
    const manager = new SessionBackgroundManager(client)

    await manager.launch(launchInput)
    await manager.launch({ ...launchInput, parentSessionID: "parent_2" })

    expect(manager.getAllDescendantTasks("parent_1").length).toBe(1)
    expect(manager.getAllDescendantTasks("parent_2").length).toBe(1)
    expect(manager.getAllDescendantTasks("parent_3").length).toBe(0)
  })
})

describe("text extraction", () => {
  test("joins assistant text and drops synthetic parts", () => {
    const text = extractText({
      parts: [
        { type: "text", text: "hello " },
        { type: "text", text: "IGNORED", synthetic: true },
        { type: "tool", text: "also ignored" },
        { type: "text", text: "world" },
      ],
    })
    expect(text).toBe("hello world")
  })
})

/**
 * Deliberately inlined rather than shared with the other bundles' copies —
 * a helper importable across bundles would be the very thing it forbids.
 */
async function importsEscapingBundle(root: string): Promise<string[]> {
  const { Glob } = await import("bun")
  const { dirname, resolve } = await import("node:path")
  const offenders: string[] = []

  for await (const file of new Glob("**/*.ts").scan({ cwd: root, absolute: true })) {
    const source = await Bun.file(file).text()
    for (const match of source.matchAll(/(?:from|import)\s+"(\.[^"]+)"/g)) {
      const target = resolve(dirname(file), match[1]!)
      if (!target.startsWith(root + "/")) {
        offenders.push(`${file.slice(root.length + 1)} → ${match[1]}`)
      }
    }
  }
  return offenders
}

describe("bundle independence", () => {
  test("no source here imports outside the bundle", async () => {
    expect(await importsEscapingBundle(import.meta.dir)).toEqual([])
  })
})
