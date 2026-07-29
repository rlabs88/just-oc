import { beforeEach, describe, expect, test } from "bun:test"
import { NO_TOOLS, type DispatchClient } from "./dispatch"
import { createAdhdTool, resetBranchSessions } from "./tool"
import {
  CLUSTER_SYSTEM,
  DEEPEN_SYSTEM,
  DIVERGE_SYSTEM,
  REFRAME_SYSTEM,
  SCORE_SYSTEM,
} from "./prompts"

type PromptCall = {
  sessionID: string
  system?: string
  tools?: Record<string, boolean>
  agent?: string
  prompt: string
}

function fakeClient(options: { failPrompt?: boolean; failCreate?: boolean } = {}) {
  const created: Array<{ parentID?: string; title?: string }> = []
  const prompts: PromptCall[] = []
  let counter = 0

  const client: DispatchClient = {
    session: {
      async create(args) {
        if (options.failCreate) return { error: new Error("server unreachable") }
        created.push({ parentID: args.body?.parentID, title: args.body?.title })
        return { data: { id: `child_${++counter}` } }
      },
      async prompt(args) {
        if (options.failPrompt) return { error: new Error("provider auth failed") }
        const system = args.body.system
        prompts.push({
          sessionID: args.path.id,
          system,
          tools: args.body.tools,
          agent: args.body.agent,
          prompt: args.body.parts[0]!.text,
        })

        let text = "{}"
        if (system === REFRAME_SYSTEM) {
          text = JSON.stringify({ reframed: "stripped", changed: false })
        } else if (system === DIVERGE_SYSTEM) {
          text = JSON.stringify([{ text: "an idea" }, { text: "another idea" }])
        } else if (system === SCORE_SYSTEM) {
          const ids = [...args.body.parts[0]!.text.matchAll(/^([0-9a-f-]{36}) :: /gm)].map(
            (match) => match[1]!,
          )
          text = JSON.stringify(
            ids.map((id, index) => ({
              id,
              novelty: 8 - index,
              viability: 6,
              fit: 7,
              strength: "s",
            })),
          )
        } else if (system === CLUSTER_SYSTEM) {
          text = JSON.stringify([])
        } else if (system === DEEPEN_SYSTEM) {
          text = JSON.stringify({ sketch: "a sketch", childIdeas: [] })
        }

        return { data: { parts: [{ type: "text", text }] } }
      },
    },
  }

  return { client, created, prompts }
}

function toolContext(sessionID: string, titles: string[] = []) {
  return {
    sessionID,
    messageID: "msg_1",
    agent: "flux",
    directory: "/tmp",
    worktree: "/tmp",
    abort: new AbortController().signal,
    metadata: (input: { title?: string }) => {
      if (input.title) titles.push(input.title)
    },
    ask: async () => {},
  }
}

const args = { problem: "make it fast", framesPerRun: 2, ideasPerFrame: 2, topK: 1 }

beforeEach(() => {
  resetBranchSessions()
})

describe("dispatch through OpenCode", () => {
  test("every branch is a child session of the calling session", async () => {
    const { client, created } = fakeClient()
    await createAdhdTool(client).execute(args as never, toolContext("parent_1") as never)

    expect(created.length).toBeGreaterThan(0)
    for (const session of created) {
      expect(session.parentID).toBe("parent_1")
    }
  })

  test("branches run with no tools", async () => {
    const { client, prompts } = fakeClient()
    await createAdhdTool(client).execute(args as never, toolContext("parent_1") as never)

    for (const call of prompts) {
      expect(call.tools).toEqual(NO_TOOLS)
      expect(call.tools?.adhd_run).toBe(false)
    }
  })

  test("the requested agent is carried into every dispatch", async () => {
    const { client, prompts } = fakeClient()
    await createAdhdTool(client).execute(
      { ...args, agent: "flux" } as never,
      toolContext("parent_1") as never,
    )

    for (const call of prompts) expect(call.agent).toBe("flux")
  })
})

describe("fan-out ceiling", () => {
  test("a branch session is refused a second-generation run", async () => {
    const { client } = fakeClient()
    const adhd = createAdhdTool(client)

    await adhd.execute(args as never, toolContext("parent_1") as never)

    // child_1 was opened as a branch during the run above.
    const result = await adhd.execute(args as never, toolContext("child_1") as never)
    expect(String(result)).toContain("one level of fan-out is the ceiling")
  })

  test("the ceiling refusal does not dispatch anything", async () => {
    const { client, created } = fakeClient()
    const adhd = createAdhdTool(client)

    await adhd.execute(args as never, toolContext("parent_1") as never)
    const before = created.length
    await adhd.execute(args as never, toolContext("child_1") as never)

    expect(created.length).toBe(before)
  })
})

describe("unavailability", () => {
  test("a provider failure surfaces as a clean error, not a fabricated result", async () => {
    const { client } = fakeClient({ failPrompt: true })
    const result = await createAdhdTool(client).execute(
      args as never,
      toolContext("parent_1") as never,
    )

    const output = String(result)
    expect(output).toStartWith("[ERROR]")
    expect(output).toContain("provider auth failed")
  })

  test("an unreachable server surfaces as a clean error", async () => {
    const { client } = fakeClient({ failCreate: true })
    const result = await createAdhdTool(client).execute(
      args as never,
      toolContext("parent_1") as never,
    )

    expect(String(result)).toStartWith("[ERROR]")
  })

  test("a malformed model argument is refused before any dispatch", async () => {
    const { client, created } = fakeClient()
    const result = await createAdhdTool(client).execute(
      { ...args, model: "no-separator" } as never,
      toolContext("parent_1") as never,
    )

    expect(String(result)).toContain('model must be "providerID/modelID"')
    expect(created.length).toBe(0)
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
  // AES-11: "Keep the plugin independent of the other four." Asserted, because a
  // convenience import from a sibling bundle is the easy way to lose it.
  test("no source here imports outside the bundle", async () => {
    expect(await importsEscapingBundle(import.meta.dir)).toEqual([])
  })
})

describe("progress reporting", () => {
  test("streams phase titles through the tool context", async () => {
    const { client } = fakeClient()
    const titles: string[] = []
    await createAdhdTool(client).execute(args as never, toolContext("parent_1", titles) as never)

    expect(titles[0]).toBe("adhd · starting")
    expect(titles.join("\n")).toContain("diverging")
    expect(titles.join("\n")).toContain("scored")
    expect(titles.at(-1)).toContain("ideas across")
  })

  test("toasts reach a TUI when one is attached", async () => {
    const { client } = fakeClient()
    const toasts: string[] = []
    const withTui = {
      ...client,
      tui: {
        showToast: async (a: { body: { message: string } }) => {
          toasts.push(a.body.message)
          return true
        },
      },
    }

    await createAdhdTool(withTui).execute(args as never, toolContext("parent_1") as never)
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(toasts.length).toBeGreaterThan(0)
    expect(toasts.some((t) => t.includes("Run complete"))).toBe(true)
  })

  test("quiet mode emits no toasts but still records the log", async () => {
    const { client } = fakeClient()
    const toasts: string[] = []
    const withTui = {
      ...client,
      tui: {
        showToast: async (a: { body: { message: string } }) => {
          toasts.push(a.body.message)
          return true
        },
      },
    }

    const result = (await createAdhdTool(withTui).execute(
      { ...args, progress: "quiet" } as never,
      toolContext("parent_1") as never,
    )) as { metadata?: Record<string, unknown> }
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(toasts).toEqual([])
    expect((result.metadata?.progress as string[]).length).toBeGreaterThan(0)
  })

  test("a failure reports how far the run got", async () => {
    const { client } = fakeClient({ failPrompt: true })
    const output = String(
      await createAdhdTool(client).execute(args as never, toolContext("parent_1") as never),
    )

    expect(output).toStartWith("[ERROR]")
    expect(output).toContain("Progress before failure:")
  })
})

describe("result", () => {
  test("returns the structured shape as JSON, not prose", async () => {
    const { client } = fakeClient()
    const result = (await createAdhdTool(client).execute(
      args as never,
      toolContext("parent_1") as never,
    )) as { title: string; output: string; metadata?: Record<string, unknown> }

    const parsed = JSON.parse(result.output)
    expect(parsed.problem).toBe("make it fast")
    expect(Array.isArray(parsed.branches)).toBe(true)
    expect(Array.isArray(parsed.shortlist)).toBe(true)
    expect(parsed).toHaveProperty("nonObviousPick")
    expect(parsed).toHaveProperty("provocation")
    expect(result.metadata?.frames).toBe(2)
  })
})
