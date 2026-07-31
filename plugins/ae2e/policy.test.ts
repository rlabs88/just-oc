import { describe, expect, test } from "bun:test"
import {
  DEFAULT_RESUME_CEILING,
  INITIAL_STATE,
  isTerminal,
  replay,
  step,
  type Directive,
  type Kickoff,
  type PolicyEvent,
  type PolicyState,
} from "./policy"

const KICKOFF: Kickoff = {
  issue: "AES-27",
  validationContract: "bun run typecheck && bun test",
  resumeCeiling: DEFAULT_RESUME_CEILING,
  validationAttempts: 2,
}

/** Drive a log through `step`, keeping what the binding would keep. */
function drive(incoming: readonly PolicyEvent[], from: PolicyState = INITIAL_STATE) {
  let state = from
  const log: PolicyEvent[] = []
  const directives: Directive[] = []
  for (const event of incoming) {
    const result = step(state, event)
    state = result.state
    log.push(...result.events)
    directives.push(...result.directives)
  }
  return { state, log, directives }
}

const activate = (generation = 0, kickoff = KICKOFF): PolicyEvent => ({
  type: "activated",
  generation,
  kickoff,
})

describe("activation", () => {
  test("a kickoff moves an idle run to active and freezes its context", () => {
    const { state } = drive([activate()])

    expect(state.run).toBe("active")
    expect(state.generation).toBe(0)
    expect(state.kickoff).toEqual(KICKOFF)
  })

  test("a second kickoff never rebinds a running session", () => {
    const other: Kickoff = { ...KICKOFF, issue: "AES-99" }
    const { state } = drive([activate(0), activate(5, other)])

    expect(state.kickoff?.issue).toBe("AES-27")
    expect(state.generation).toBe(0)
  })

  test("nothing but a kickoff moves an idle run", () => {
    const { state } = drive([
      { type: "turn_completed" },
      { type: "children_resolved", generation: 1, context: "done" },
      { type: "fence_applied", generation: 2 },
      { type: "cancelled", generation: 3 },
    ])

    expect(state).toEqual(INITIAL_STATE)
  })
})

describe("parking", () => {
  test("registered children park the run", () => {
    const { state } = drive([
      activate(),
      { type: "children_registered", generation: 1, children: ["AES-28", "AES-29"] },
    ])

    expect(state.run).toBe("waiting_on_children")
    expect(state.children).toEqual(["AES-28", "AES-29"])
  })

  test("an empty child set is a wait on nothing and is refused", () => {
    const { state } = drive([activate(), { type: "children_registered", generation: 1, children: [] }])

    expect(state.run).toBe("active")
    // The refused envelope did not consume its generation either.
    expect(state.generation).toBe(0)
  })

  test("an external halt parks the run and records why", () => {
    const { state } = drive([
      activate(),
      { type: "external_halt", generation: 1, reason: "missing credential" },
    ])

    expect(state.run).toBe("waiting_on_external")
    expect(state.waitReason).toBe("missing credential")
  })

  test("a turn ending under an established wait changes nothing but the turn count", () => {
    const parked = drive([
      activate(),
      { type: "children_registered", generation: 1, children: ["AES-28"] },
    ])
    const { state, directives } = drive([{ type: "turn_completed" }], parked.state)

    expect(state.run).toBe("waiting_on_children")
    expect(state.turns).toBe(1)
    expect(directives).toEqual([])
  })
})

describe("resume", () => {
  test("a resolve at an unseen generation resumes with the envelope's context", () => {
    const { state, directives } = drive([
      activate(),
      { type: "children_registered", generation: 1, children: ["AES-28"] },
      { type: "children_resolved", generation: 2, context: "AES-28 merged" },
    ])

    expect(state.run).toBe("active")
    expect(state.consecutiveResumes).toBe(1)
    expect(state.children).toEqual([])
    expect(directives).toContainEqual({ type: "resume", message: "AES-28 merged" })
  })

  test("an external resolve resumes the same way", () => {
    const { state, directives } = drive([
      activate(),
      { type: "external_halt", generation: 1, reason: "blocked" },
      { type: "external_resolved", generation: 2, context: "blocker cleared" },
    ])

    expect(state.run).toBe("active")
    expect(state.waitReason).toBeNull()
    expect(directives).toContainEqual({ type: "resume", message: "blocker cleared" })
  })

  test("a duplicate envelope at the same generation produces exactly one resume", () => {
    const resolve: PolicyEvent = { type: "children_resolved", generation: 2, context: "merged" }
    const { state, log, directives } = drive([
      activate(),
      { type: "children_registered", generation: 1, children: ["AES-28"] },
      resolve,
      resolve,
      resolve,
    ])

    expect(directives.filter((directive) => directive.type === "resume")).toHaveLength(1)
    expect(state.consecutiveResumes).toBe(1)
    // The duplicates are still in the log. Ignoring is a fold decision, not an
    // intake decision, so a replay reaches the same conclusion.
    expect(log.filter((event) => event.type === "children_resolved")).toHaveLength(3)
  })

  test("a stale generation is ignored rather than applied out of order", () => {
    const { state, directives } = drive([
      activate(),
      { type: "children_registered", generation: 4, children: ["AES-28"] },
      { type: "children_resolved", generation: 2, context: "stale" },
    ])

    expect(state.run).toBe("waiting_on_children")
    expect(directives.some((directive) => directive.type === "resume")).toBe(false)
  })

  test("a non-integer generation is not a generation", () => {
    const { state } = drive([
      activate(),
      { type: "children_registered", generation: 1.5, children: ["AES-28"] },
    ])

    expect(state.run).toBe("active")
  })

  test("a resume is never issued from anywhere but resume_requested", () => {
    const active = drive([activate()])
    const { state, directives } = drive([{ type: "resume_issued" }], active.state)

    expect(state).toEqual(active.state)
    expect(directives).toEqual([])
  })
})

describe("no runaway loop", () => {
  test("a turn ending in active with nothing pending escalates instead of re-prompting", () => {
    const { state, directives } = drive([activate(), { type: "turn_completed" }])

    expect(state.run).toBe("escalated")
    expect(state.escalation).toBe("stalled")
    expect(directives.some((directive) => directive.type === "resume")).toBe(false)
    expect(directives).toContainEqual({
      type: "escalate",
      reason: "stalled",
      evidence: { issue: "AES-27", generation: 0, turns: 1, resumes: 0, children: [] },
    })
  })

  test("the consecutive-resume ceiling escalates rather than resuming again", () => {
    const events: PolicyEvent[] = [activate()]
    let generation = 0
    // Park and resolve far more times than the ceiling allows. Nothing here ever
    // produces a deliverable, so the run never makes progress and the ceiling is
    // the only thing standing between this and an unbounded park/resume cycle.
    for (let round = 0; round < 10; round += 1) {
      events.push({ type: "children_registered", generation: ++generation, children: ["child"] })
      events.push({ type: "children_resolved", generation: ++generation, context: `round ${round}` })
    }
    const { state, directives } = drive(events)

    expect(state.run).toBe("escalated")
    expect(state.escalation).toBe("resume_ceiling")
    expect(directives.filter((directive) => directive.type === "resume")).toHaveLength(
      DEFAULT_RESUME_CEILING,
    )
    expect(directives).toContainEqual({
      type: "escalate",
      reason: "resume_ceiling",
      evidence: {
        issue: "AES-27",
        // The round that crossed the ceiling still consumed both its generations.
        generation: (DEFAULT_RESUME_CEILING + 1) * 2,
        turns: 0,
        resumes: DEFAULT_RESUME_CEILING,
        children: [],
      },
    })
  })

  test("a terminal run absorbs everything that arrives afterwards", () => {
    const escalated = drive([activate(), { type: "turn_completed" }])
    const { state, directives } = drive(
      [
        { type: "children_registered", generation: 9, children: ["child"] },
        { type: "children_resolved", generation: 10, context: "late" },
        { type: "turn_completed" },
        { type: "cancelled", generation: 11 },
      ],
      escalated.state,
    )

    expect(state).toEqual(escalated.state)
    expect(directives).toEqual([])
    expect(isTerminal(state.run)).toBe(true)
  })
})

describe("validation and termination", () => {
  test("a declared deliverable moves the run to validating", () => {
    const { state } = drive([activate(), { type: "deliverable_ready", generation: 1 }])

    expect(state.run).toBe("validating")
  })

  test("validation passing completes the run", () => {
    const { state, directives } = drive([
      activate(),
      { type: "deliverable_ready", generation: 1 },
      { type: "validation_passed", generation: 2 },
    ])

    expect(state.run).toBe("complete")
    expect(directives.at(-1)).toEqual({
      type: "publish",
      state: "complete",
      evidence: { issue: "AES-27", generation: 2, turns: 0, resumes: 0, children: [] },
    })
  })

  test("validation failing returns to active while the attempt budget holds", () => {
    const { state } = drive([
      activate(),
      { type: "deliverable_ready", generation: 1 },
      { type: "validation_failed", generation: 2 },
    ])

    expect(state.run).toBe("active")
    expect(state.validationFailures).toBe(1)
  })

  test("exhausting the attempt budget escalates", () => {
    const { state, directives } = drive([
      activate(),
      { type: "deliverable_ready", generation: 1 },
      { type: "validation_failed", generation: 2 },
      { type: "deliverable_ready", generation: 3 },
      { type: "validation_failed", generation: 4 },
    ])

    expect(state.run).toBe("escalated")
    expect(state.escalation).toBe("validation_budget")
    expect(directives.some((directive) => directive.type === "escalate")).toBe(true)
  })

  test("a fence escalates from a wait", () => {
    const { state } = drive([
      activate(),
      { type: "children_registered", generation: 1, children: ["AES-28"] },
      { type: "fence_applied", generation: 2 },
    ])

    expect(state.run).toBe("escalated")
    expect(state.escalation).toBe("fence_applied")
  })

  test("a fence escalates from active too", () => {
    const { state } = drive([activate(), { type: "fence_applied", generation: 1 }])

    expect(state.run).toBe("escalated")
    expect(state.escalation).toBe("fence_applied")
  })

  test("a cancel fails the run and aborts the session", () => {
    const { state, directives } = drive([activate(), { type: "cancelled", generation: 1 }])

    expect(state.run).toBe("failed")
    expect(state.failure).toBe("cancelled")
    expect(directives).toContainEqual({ type: "abort" })
  })
})

describe("determinism", () => {
  const events: PolicyEvent[] = [
    activate(),
    { type: "children_registered", generation: 1, children: ["AES-28"] },
    { type: "children_resolved", generation: 2, context: "merged" },
    { type: "children_resolved", generation: 2, context: "merged" },
    { type: "children_registered", generation: 3, children: ["AES-29"] },
    { type: "external_resolved", generation: 4, context: "wrong wait" },
    { type: "children_resolved", generation: 5, context: "merged again" },
    { type: "deliverable_ready", generation: 6 },
    { type: "validation_passed", generation: 7 },
  ]

  test("replaying one log twice yields identical state", () => {
    const { state, log } = drive(events)

    expect(replay(log)).toEqual(state)
    expect(replay(log)).toEqual(replay(log))
  })

  test("the settling resume is in the log, so a replay reaches the same run", () => {
    const { log } = drive(events)

    expect(log.filter((event) => event.type === "resume_issued")).toHaveLength(2)
    expect(replay(log).run).toBe("complete")
  })
})

/**
 * Core purity, enforced by reading the sources rather than asserted in prose.
 *
 * AES-26 makes this a validation metric for every AE2E child: the core must
 * import no harness type and perform no I/O. A review can miss a new import; a
 * failing test cannot.
 */
const CORE = ["policy.ts", "envelope.ts", "ports.ts"] as const

const IO_SURFACES = [
  "fetch(",
  "Bun.",
  "process.",
  "require(",
  "globalThis",
  "Date.now",
  "new Date",
  "Math.random",
  "setTimeout",
  "setInterval",
  "console.",
] as const

async function coreSource(file: string): Promise<string> {
  return Bun.file(`${import.meta.dir}/${file}`).text()
}

describe("core purity", () => {
  test("the core imports nothing but the core", async () => {
    for (const file of CORE) {
      const source = await coreSource(file)
      const specifiers = [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]!)
      for (const specifier of specifiers) {
        expect({ file, specifier, relative: specifier.startsWith("./") }).toEqual({
          file,
          specifier,
          relative: true,
        })
        const target = `${specifier.slice(2)}.ts`
        expect({ file, target, inCore: CORE.includes(target as (typeof CORE)[number]) }).toEqual({
          file,
          target,
          inCore: true,
        })
      }
    }
  })

  test("the core performs no I/O and reads no clock", async () => {
    for (const file of CORE) {
      const source = await coreSource(file)
      for (const surface of IO_SURFACES) {
        expect({ file, surface, present: source.includes(surface) }).toEqual({
          file,
          surface,
          present: false,
        })
      }
    }
  })
})
