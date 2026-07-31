import { describe, expect, test } from "bun:test"
import Ae2ePlugin, { createPolicySetForClient } from "./index"
import { createPolicySet, type PolicySet } from "./sessions"
import { createOpencodeRuntime, POLICY_METADATA_KEY, type RuntimeClient } from "./runtime"
import { createHttpCoordinator } from "./coordinator"
import {
  CONTROL_PLANE_ORIGIN,
  ENVELOPE_MARKER,
  ENVELOPE_VERSION,
  ORIGIN_METADATA_KEY,
  parseEnvelope,
  type LifecycleEnvelope,
} from "./envelope"
import { DEFAULT_RESUME_CEILING } from "./policy"
import type { AgentRuntime, CoordinatorChannel, Escalation, StatePublication } from "./ports"

const ISSUE = "AES-27"

function envelope(fields: Record<string, unknown>): LifecycleEnvelope {
  const parsed = parseEnvelope(
    JSON.stringify({
      marker: ENVELOPE_MARKER,
      version: ENVELOPE_VERSION,
      issue: ISSUE,
      ...fields,
    }),
  )
  if (!parsed) throw new Error(`test fixture is not a valid envelope: ${JSON.stringify(fields)}`)
  return parsed
}

const kickoff = (fields: Record<string, unknown> = {}) =>
  envelope({
    kind: "kickoff",
    generation: 0,
    arp: "AE2E",
    validationContract: "bun test",
    ...fields,
  })

type PromptCall = {
  sessionID: string
  noReply?: boolean
  text: string
  metadata?: Record<string, unknown>
}

function fakeClient(options: { failPrompt?: boolean } = {}) {
  const prompts: PromptCall[] = []
  const aborts: string[] = []

  const client: RuntimeClient = {
    session: {
      async promptAsync(args) {
        if (options.failPrompt) throw new Error("server unreachable")
        const part = args.body.parts[0]!
        prompts.push({
          sessionID: args.path.id,
          noReply: args.body.noReply,
          text: part.text,
          metadata: part.metadata,
        })
        return {}
      },
      async abort(args) {
        aborts.push(args.path.id)
        return {}
      },
    },
  }

  return { client, prompts, aborts }
}

function fakeCoordinator() {
  const published: StatePublication[] = []
  const escalations: Escalation[] = []
  const coordinator: CoordinatorChannel = {
    async publishState(publication) {
      published.push(publication)
    },
    async escalate(escalation) {
      escalations.push(escalation)
    },
  }
  return { coordinator, published, escalations }
}

function harness(options: { failPrompt?: boolean } = {}) {
  const { client, prompts, aborts } = fakeClient(options)
  const { coordinator, published, escalations } = fakeCoordinator()
  const errors: string[] = []
  const policies = createPolicySet({
    runtime: createOpencodeRuntime(client),
    coordinator,
    onError: (error, context) => errors.push(`${context}: ${String(error)}`),
  })
  return { policies, prompts, aborts, published, escalations, errors }
}

async function park(policies: PolicySet, sessionID: string) {
  await policies.onLifecycleEvent(sessionID, kickoff())
  await policies.onLifecycleEvent(
    sessionID,
    envelope({ kind: "children_registered", generation: 1, children: ["AES-28"] }),
  )
}

describe("park and resume", () => {
  test("parking leaves the session idle: no turn, no timer, no poll", async () => {
    const { policies, prompts } = harness()
    await park(policies, "ses_one")

    expect(policies.snapshot("ses_one")?.state.run).toBe("waiting_on_children")
    // Parking is the absence of a call. Nothing was sent to the host at all.
    expect(prompts).toEqual([])
  })

  test("a resolving envelope resumes the session as a new turn carrying its context", async () => {
    const { policies, prompts } = harness()
    await park(policies, "ses_one")
    await policies.onLifecycleEvent(
      "ses_one",
      envelope({ kind: "children_resolved", generation: 2, context: "AES-28 merged, rebase onto it" }),
    )

    expect(policies.snapshot("ses_one")?.state.run).toBe("active")
    expect(prompts).toEqual([
      {
        sessionID: "ses_one",
        noReply: false,
        text: "AES-28 merged, rebase onto it",
        metadata: { [POLICY_METADATA_KEY]: "resume" },
      },
    ])
  })

  test("a duplicate envelope at the same generation produces exactly one resume", async () => {
    const { policies, prompts } = harness()
    await park(policies, "ses_one")
    const resolved = envelope({ kind: "children_resolved", generation: 2, context: "merged" })

    await policies.onLifecycleEvent("ses_one", resolved)
    await policies.onLifecycleEvent("ses_one", resolved)
    await policies.onLifecycleEvent("ses_one", resolved)

    expect(prompts).toHaveLength(1)
  })

  test("an envelope at a stale generation is ignored", async () => {
    const { policies, prompts } = harness()
    await policies.onLifecycleEvent("ses_one", kickoff())
    await policies.onLifecycleEvent(
      "ses_one",
      envelope({ kind: "children_registered", generation: 5, children: ["AES-28"] }),
    )
    await policies.onLifecycleEvent(
      "ses_one",
      envelope({ kind: "children_resolved", generation: 3, context: "stale" }),
    )

    expect(policies.snapshot("ses_one")?.state.run).toBe("waiting_on_children")
    expect(prompts).toEqual([])
  })

  test("an envelope addressed to another issue never steers this run", async () => {
    const { policies, prompts } = harness()
    await park(policies, "ses_one")
    const misaddressed = parseEnvelope(
      JSON.stringify({
        marker: ENVELOPE_MARKER,
        version: ENVELOPE_VERSION,
        kind: "children_resolved",
        generation: 2,
        issue: "AES-99",
        context: "someone else's children",
      }),
    )!

    await policies.onLifecycleEvent("ses_one", misaddressed)

    expect(policies.snapshot("ses_one")?.state.run).toBe("waiting_on_children")
    expect(prompts).toEqual([])
  })

  test("a cancel aborts the session", async () => {
    const { policies, aborts } = harness()
    await park(policies, "ses_one")
    await policies.onLifecycleEvent("ses_one", envelope({ kind: "cancel", generation: 2 }))

    expect(policies.snapshot("ses_one")?.state.run).toBe("failed")
    expect(aborts).toEqual(["ses_one"])
  })
})

describe("session scoping", () => {
  test("idle from an unbound session never advances a bound policy", async () => {
    const { policies } = harness()
    await park(policies, "ses_one")

    // A subagent, a background task, and an unrelated conversation, all idling
    // on the same server.
    for (const other of ["ses_subagent", "ses_background", "ses_unrelated"]) {
      policies.onTurnStart(other)
      await policies.onTurnComplete(other)
    }

    expect(policies.bound).toEqual(["ses_one"])
    expect(policies.snapshot("ses_one")?.state.turns).toBe(0)
    expect(policies.snapshot("ses_subagent")).toBeNull()
  })

  test("turn-boundary detection fires exactly once per turn", async () => {
    const { policies } = harness()
    await policies.onLifecycleEvent("ses_one", kickoff())

    policies.onTurnStart("ses_one")
    policies.onTurnStart("ses_one")
    await policies.onTurnComplete("ses_one")
    // A second idle for a turn that already closed finds no open turn.
    await policies.onTurnComplete("ses_one")
    await policies.onTurnComplete("ses_one")

    expect(policies.snapshot("ses_one")?.state.turns).toBe(1)
  })

  test("two concurrent AE2E sessions keep independent state", async () => {
    const { policies, prompts } = harness()
    await park(policies, "ses_one")
    await park(policies, "ses_two")

    await policies.onLifecycleEvent(
      "ses_one",
      envelope({ kind: "children_resolved", generation: 2, context: "one resolved" }),
    )

    expect(policies.snapshot("ses_one")?.state.run).toBe("active")
    expect(policies.snapshot("ses_two")?.state.run).toBe("waiting_on_children")
    expect(prompts.map((prompt) => prompt.sessionID)).toEqual(["ses_one"])
  })

  test("one session cannot resume another", async () => {
    const { policies, prompts } = harness()
    await park(policies, "ses_one")
    await park(policies, "ses_two")

    // ses_two's turn ends. ses_one is parked and must not notice.
    policies.onTurnStart("ses_two")
    await policies.onTurnComplete("ses_two")

    expect(policies.snapshot("ses_one")?.state.turns).toBe(0)
    expect(policies.snapshot("ses_one")?.state.run).toBe("waiting_on_children")
    expect(prompts).toEqual([])
  })
})

describe("no runaway loop", () => {
  test("the loop-prone path terminates in a bounded number of turns", async () => {
    const { policies, prompts, escalations } = harness()
    await policies.onLifecycleEvent("ses_one", kickoff())

    // A coordinator that keeps parking and resolving without the run ever
    // producing a deliverable. Each resume is a real turn, so an unbounded
    // policy would burn turns forever.
    let generation = 0
    for (let round = 0; round < 25; round += 1) {
      await policies.onLifecycleEvent(
        "ses_one",
        envelope({ kind: "children_registered", generation: ++generation, children: ["child"] }),
      )
      await policies.onLifecycleEvent(
        "ses_one",
        envelope({ kind: "children_resolved", generation: ++generation, context: `round ${round}` }),
      )
      policies.onTurnStart("ses_one")
      await policies.onTurnComplete("ses_one")
    }

    expect(prompts.length).toBeLessThanOrEqual(DEFAULT_RESUME_CEILING)
    expect(policies.snapshot("ses_one")?.state.run).toBe("escalated")
    expect(escalations).toHaveLength(1)
  })

  test("a turn the host drains from a queued envelope never disturbs a parked run", async () => {
    const { policies, prompts, escalations } = harness()
    await policies.onLifecycleEvent("ses_one", kickoff())

    // The agent is working, and the coordinator parks the run mid-turn — which
    // it must, because a turn ending in `active` is a stall. OpenCode honours
    // `noReply` only on an idle session, so this delivery is also queued and
    // drains as a turn of its own once the working turn ends.
    policies.onTurnStart("ses_one")
    await policies.onLifecycleEvent(
      "ses_one",
      envelope({ kind: "children_registered", generation: 1, children: ["AES-28"] }),
    )
    await policies.onTurnComplete("ses_one")

    policies.onTurnStart("ses_one")
    await policies.onTurnComplete("ses_one")

    expect(policies.snapshot("ses_one")?.state.run).toBe("waiting_on_children")
    expect(policies.snapshot("ses_one")?.state.turns).toBe(2)
    expect(prompts).toEqual([])
    expect(escalations).toEqual([])
  })

  test("a turn ending with nothing pending escalates instead of re-prompting", async () => {
    const { policies, prompts, escalations } = harness()
    await policies.onLifecycleEvent("ses_one", kickoff())

    policies.onTurnStart("ses_one")
    await policies.onTurnComplete("ses_one")

    expect(prompts).toEqual([])
    expect(escalations).toHaveLength(1)
    expect(escalations[0]).toMatchObject({ sessionID: "ses_one", issue: ISSUE, reason: "stalled" })
  })
})

describe("publication", () => {
  test("every state change is published with evidence", async () => {
    const { policies, published } = harness()
    await park(policies, "ses_one")
    await policies.onLifecycleEvent(
      "ses_one",
      envelope({ kind: "children_resolved", generation: 2, context: "merged" }),
    )

    expect(published.map((publication) => publication.state)).toEqual([
      "active",
      "waiting_on_children",
      "resume_requested",
      "active",
    ])
    expect(published.at(-1)).toMatchObject({ sessionID: "ses_one", issue: ISSUE })
    expect(published.at(-1)?.evidence.resumes).toBe(1)
  })

  test("a failed resume is reported without taking the run down", async () => {
    const { policies, errors } = harness({ failPrompt: true })
    await park(policies, "ses_one")
    await policies.onLifecycleEvent(
      "ses_one",
      envelope({ kind: "children_resolved", generation: 2, context: "merged" }),
    )

    // The transition is already in the log; the directive failing does not undo
    // it, and nothing retries.
    expect(policies.snapshot("ses_one")?.state.run).toBe("active")
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain("resume for ses_one")
  })
})

describe("the http coordinator", () => {
  test("publishes to the endpoint the kickoff declared", async () => {
    const sent: Array<{ endpoint: string; payload: Record<string, unknown> }> = []
    const coordinator = createHttpCoordinator(async (endpoint, payload) => {
      sent.push({ endpoint, payload })
    })
    const { client } = fakeClient()
    const policies = createPolicySet({ runtime: createOpencodeRuntime(client), coordinator })

    await policies.onLifecycleEvent(
      "ses_one",
      kickoff({ publishUrl: "https://control.invalid/ae2e" }),
    )

    expect(sent).toHaveLength(1)
    expect(sent[0]!.endpoint).toBe("https://control.invalid/ae2e")
    expect(sent[0]!.payload).toMatchObject({ type: "ae2e.state", state: "active", issue: ISSUE })
  })

  test("a session told no endpoint publishes nowhere", async () => {
    let calls = 0
    const coordinator = createHttpCoordinator(async () => {
      calls += 1
    })
    const { client } = fakeClient()
    const policies = createPolicySet({ runtime: createOpencodeRuntime(client), coordinator })

    await policies.onLifecycleEvent("ses_one", kickoff())

    expect(calls).toBe(0)
  })

  test("an unreachable coordinator is reported, not thrown", async () => {
    const errors: string[] = []
    const coordinator = createHttpCoordinator(
      async () => {
        throw new Error("connection refused")
      },
      (error, context) => errors.push(`${context}: ${String(error)}`),
    )
    const { client } = fakeClient()
    const policies = createPolicySet({ runtime: createOpencodeRuntime(client), coordinator })

    await policies.onLifecycleEvent("ses_one", kickoff({ publishUrl: "https://control.invalid" }))

    expect(policies.snapshot("ses_one")?.state.run).toBe("active")
    expect(errors[0]).toContain("publishState")
  })
})

/** The plugin as OpenCode initializes it, driven through its two hooks. */
async function pluginHarness(options: { failPrompt?: boolean } = {}) {
  const { client, prompts, aborts } = fakeClient(options)
  const hooks = await Ae2ePlugin({ client } as never)

  const message = async (sessionID: string, role: string, parts: unknown[]) =>
    hooks["chat.message"]!(
      { sessionID } as never,
      { message: { role, sessionID } as never, parts: parts as never },
    )

  const emit = async (event: unknown) => hooks.event!({ event } as never)

  return {
    hooks,
    prompts,
    aborts,
    controlPlane: (sessionID: string, fields: Record<string, unknown>) =>
      message(sessionID, "user", [
        {
          type: "text",
          text: JSON.stringify({
            marker: ENVELOPE_MARKER,
            version: ENVELOPE_VERSION,
            issue: ISSUE,
            ...fields,
          }),
          metadata: { [ORIGIN_METADATA_KEY]: CONTROL_PLANE_ORIGIN },
        },
      ]),
    assistant: (sessionID: string, fields: Record<string, unknown>) =>
      message(sessionID, "assistant", [
        {
          type: "text",
          text: JSON.stringify({
            marker: ENVELOPE_MARKER,
            version: ENVELOPE_VERSION,
            issue: ISSUE,
            ...fields,
          }),
          metadata: { [ORIGIN_METADATA_KEY]: CONTROL_PLANE_ORIGIN },
        },
      ]),
    busy: (sessionID: string) =>
      emit({ type: "session.status", properties: { sessionID, status: { type: "busy" } } }),
    idle: (sessionID: string) => emit({ type: "session.idle", properties: { sessionID } }),
  }
}

const KICKOFF_FIELDS = {
  kind: "kickoff",
  generation: 0,
  arp: "AE2E",
  validationContract: "bun test",
}

describe("the plugin is invisible when the policy is not in use", () => {
  test("it offers no tool, alters no config, and claims only the two hooks it needs", async () => {
    const { hooks } = await pluginHarness()

    expect(hooks.tool).toBeUndefined()
    expect(hooks.config).toBeUndefined()
    expect(hooks["chat.params"]).toBeUndefined()
    expect(hooks["experimental.chat.messages.transform"]).toBeUndefined()
    expect(typeof hooks.event).toBe("function")
    expect(typeof hooks["chat.message"]).toBe("function")
  })

  test("a session with no kickoff is never touched", async () => {
    const { prompts, aborts, busy, idle, controlPlane } = await pluginHarness()

    await busy("ses_plain")
    await idle("ses_plain")
    // Even genuine control-plane lifecycle traffic does nothing without a kickoff.
    await controlPlane("ses_plain", { kind: "children_resolved", generation: 4, context: "merged" })
    await controlPlane("ses_plain", { kind: "fence_applied", generation: 5 })
    await busy("ses_plain")
    await idle("ses_plain")

    expect(prompts).toEqual([])
    expect(aborts).toEqual([])
  })

  test("a session cannot self-authorize AE2E by emitting envelope-shaped output", async () => {
    const { prompts, assistant, controlPlane, busy, idle } = await pluginHarness()

    await assistant("ses_forge", KICKOFF_FIELDS)
    // If the forged kickoff had landed, this resolve would resume the session.
    await assistant("ses_forge", { kind: "children_registered", generation: 1, children: ["x"] })
    await controlPlane("ses_forge", { kind: "children_resolved", generation: 2, context: "merged" })
    await busy("ses_forge")
    await idle("ses_forge")

    expect(prompts).toEqual([])
  })
})

describe("the plugin end to end", () => {
  test("kickoff, park, resolve, resume — through the hooks OpenCode calls", async () => {
    const { prompts, controlPlane, busy, idle } = await pluginHarness()

    await controlPlane("ses_run", KICKOFF_FIELDS)
    await controlPlane("ses_run", {
      kind: "children_registered",
      generation: 1,
      children: ["AES-28"],
    })

    // The turn that dispatched the children drains. Parking is already
    // established, so the ending turn is not a stall and nothing is sent.
    await busy("ses_run")
    await idle("ses_run")
    expect(prompts).toEqual([])

    await controlPlane("ses_run", {
      kind: "children_resolved",
      generation: 2,
      context: "AES-28 merged",
    })

    expect(prompts).toEqual([
      {
        sessionID: "ses_run",
        noReply: false,
        text: "AES-28 merged",
        metadata: { [POLICY_METADATA_KEY]: "resume" },
      },
    ])
  })
})

describe("the exported policy set", () => {
  test("createPolicySetForClient wires the real runtime binding", async () => {
    const { client, prompts } = fakeClient()
    const policies = createPolicySetForClient(client)

    await park(policies, "ses_one")
    await policies.onLifecycleEvent(
      "ses_one",
      envelope({ kind: "children_resolved", generation: 2, context: "merged" }),
    )
    await policies.settled()

    expect(prompts.map((prompt) => prompt.noReply)).toEqual([false])
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

  test("the bundle ships its own checkpoint pair and standard", async () => {
    for (const file of ["AGENTS.md", "CONTEXT.md", "STANDARD.md"]) {
      expect({ file, present: await Bun.file(`${import.meta.dir}/${file}`).exists() }).toEqual({
        file,
        present: true,
      })
    }
  })

  test("it is registered in both the validation script and the installer", async () => {
    // Missing either leaves the bundle silently uninstalled or unvalidated.
    const root = `${import.meta.dir}/../..`
    const packageJson = await Bun.file(`${root}/package.json`).text()
    const justfile = await Bun.file(`${root}/Justfile`).text()

    expect(packageJson).toContain("./plugins/ae2e/index.ts")
    expect(packageJson).toContain("./.opencode/plugins/ae2e.ts")
    expect(justfile).toContain('"ae2e"')
  })

  test("the project loader re-exports the entry point and adds no behaviour", async () => {
    const loader = await Bun.file(
      `${import.meta.dir}/../../.opencode/plugins/ae2e.ts`,
    ).text()

    expect(loader.trim()).toBe('export { default } from "../../plugins/ae2e/index"')
  })
})
