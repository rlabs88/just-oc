/**
 * The AE2E runtime-policy core.
 *
 * This file is the whole state machine and it is deliberately inert: no import,
 * no host type, no clock, no I/O. State is a fold over an append-only event log,
 * so a replacement container reconstructs the run by replaying the log rather
 * than by restoring a plugin-private store that died with the old compute.
 *
 * The scope implemented here is the park-and-resume spine of AES-26's Q4 table.
 * `consulting` and the advisor-reply edges are absent because the advisor
 * channel is a declared follow-on; every transition that *is* here is exercised
 * by `policy.test.ts`, including each escalation path.
 *
 * Two rows of AES-26's table are collapsed into one here. `active + turn_complete
 * + deliverable -> validating` and `active + deliverable_ready -> validating` are
 * the same fact arriving in either order, so a declared deliverable moves to
 * `validating` immediately and a turn ending in `active` therefore always means
 * the run stalled.
 */

/** Run states. `complete`, `escalated`, and `failed` are terminal. */
export type RunState =
  | "idle"
  | "active"
  | "waiting_on_children"
  | "waiting_on_external"
  | "resume_requested"
  | "validating"
  | "complete"
  | "escalated"
  | "failed"

export type EscalationReason =
  | "stalled"
  | "resume_ceiling"
  | "fence_applied"
  | "validation_budget"

/** Frozen activation context. The core never reads it back out to the host. */
export type Kickoff = {
  readonly issue: string
  readonly validationContract: string
  readonly resumeCeiling: number
  readonly validationAttempts: number
}

/**
 * Log entries.
 *
 * Every event carrying a `generation` came from a lifecycle envelope and is
 * subject to the generation guard. `turn_completed` and `resume_issued` are the
 * two host-side facts, and they carry no generation precisely because they are
 * not coordinator claims about the world.
 */
export type PolicyEvent =
  | { readonly type: "activated"; readonly generation: number; readonly kickoff: Kickoff }
  | {
      readonly type: "children_registered"
      readonly generation: number
      readonly children: readonly string[]
    }
  | { readonly type: "external_halt"; readonly generation: number; readonly reason: string }
  | { readonly type: "children_resolved"; readonly generation: number; readonly context: string }
  | { readonly type: "external_resolved"; readonly generation: number; readonly context: string }
  | { readonly type: "deliverable_ready"; readonly generation: number }
  | { readonly type: "validation_passed"; readonly generation: number }
  | { readonly type: "validation_failed"; readonly generation: number }
  | { readonly type: "fence_applied"; readonly generation: number }
  | { readonly type: "cancelled"; readonly generation: number }
  | { readonly type: "turn_completed" }
  | { readonly type: "resume_issued" }

export type PolicyState = {
  readonly run: RunState
  /** Highest lifecycle generation actually applied. Starts below any legal generation. */
  readonly generation: number
  readonly kickoff: Kickoff | null
  readonly children: readonly string[]
  readonly waitReason: string | null
  /** Context an accepted resolve carries, consumed by the resume it produces. */
  readonly pendingResume: string | null
  readonly consecutiveResumes: number
  readonly validationFailures: number
  readonly turns: number
  readonly escalation: EscalationReason | null
  readonly failure: string | null
}

/** Published alongside every state change so the coordinator can project it. */
export type Evidence = {
  readonly issue: string | null
  readonly generation: number
  readonly turns: number
  readonly resumes: number
  readonly children: readonly string[]
}

/**
 * What the binding must do. Directives come out of the fold rather than out of
 * the binding's own reasoning, so a guard that refuses a resume refuses the
 * runtime call too — the ceiling cannot be bypassed by the caller.
 */
export type Directive =
  | { readonly type: "resume"; readonly message: string }
  | { readonly type: "abort" }
  | { readonly type: "publish"; readonly state: RunState; readonly evidence: Evidence }
  | { readonly type: "escalate"; readonly reason: EscalationReason; readonly evidence: Evidence }

export type StepResult = {
  readonly state: PolicyState
  /** Exactly what to append to the log, in order, including any settling event. */
  readonly events: readonly PolicyEvent[]
  readonly directives: readonly Directive[]
}

export const DEFAULT_RESUME_CEILING = 3
export const DEFAULT_VALIDATION_ATTEMPTS = 2

export const INITIAL_STATE: PolicyState = {
  run: "idle",
  generation: -1,
  kickoff: null,
  children: [],
  waitReason: null,
  pendingResume: null,
  consecutiveResumes: 0,
  validationFailures: 0,
  turns: 0,
  escalation: null,
  failure: null,
}

const TERMINAL: readonly RunState[] = ["complete", "escalated", "failed"]

export function isTerminal(run: RunState): boolean {
  return TERMINAL.includes(run)
}

function evidenceOf(state: PolicyState): Evidence {
  return {
    issue: state.kickoff?.issue ?? null,
    generation: state.generation,
    turns: state.turns,
    resumes: state.consecutiveResumes,
    children: state.children,
  }
}

/**
 * Apply one event.
 *
 * Ignoring is the default: a guard that does not hold returns the state
 * unchanged and, critically, does not advance the generation. A rejected
 * envelope therefore leaves no trace that would block a later valid one at the
 * same generation, and a duplicate at an already-applied generation is inert
 * because the guard below is a strict `>`.
 */
export function reduce(state: PolicyState, event: PolicyEvent): PolicyState {
  if (isTerminal(state.run)) return state

  if ("generation" in event) {
    if (!Number.isSafeInteger(event.generation)) return state
    if (event.generation <= state.generation) return state
  }

  switch (event.type) {
    case "activated": {
      if (state.run !== "idle") return state
      return { ...state, run: "active", generation: event.generation, kickoff: event.kickoff }
    }

    case "children_registered": {
      if (state.run !== "active") return state
      // A wait on an empty child set is a wait on nothing, and would park a run
      // that no lifecycle event will ever resolve.
      if (event.children.length === 0) return state
      return {
        ...state,
        run: "waiting_on_children",
        generation: event.generation,
        children: [...event.children],
      }
    }

    case "external_halt": {
      if (state.run !== "active") return state
      return {
        ...state,
        run: "waiting_on_external",
        generation: event.generation,
        waitReason: event.reason,
      }
    }

    case "children_resolved": {
      if (state.run !== "waiting_on_children") return state
      return {
        ...state,
        run: "resume_requested",
        generation: event.generation,
        pendingResume: event.context,
        children: [],
      }
    }

    case "external_resolved": {
      if (state.run !== "waiting_on_external") return state
      return {
        ...state,
        run: "resume_requested",
        generation: event.generation,
        pendingResume: event.context,
        waitReason: null,
      }
    }

    case "resume_issued": {
      // AES-26 invariant 8: this is the only door into `active` from a wait, and
      // it opens only from `resume_requested`.
      if (state.run !== "resume_requested") return state
      const ceiling = state.kickoff?.resumeCeiling ?? DEFAULT_RESUME_CEILING
      const resumes = state.consecutiveResumes + 1
      if (resumes > ceiling) {
        return {
          ...state,
          run: "escalated",
          escalation: "resume_ceiling",
          pendingResume: null,
        }
      }
      return { ...state, run: "active", consecutiveResumes: resumes, pendingResume: null }
    }

    case "turn_completed": {
      // A turn before activation belongs to whatever the session was doing
      // before the policy existed, and is not evidence about this run.
      if (state.run === "idle") return state
      const turns = state.turns + 1
      // A turn ending under an established wait is the parked turn draining, not
      // a stall — and it is never a reason to resume.
      if (state.run !== "active") return { ...state, turns }
      return { ...state, turns, run: "escalated", escalation: "stalled" }
    }

    case "deliverable_ready": {
      if (state.run !== "active") return state
      return { ...state, run: "validating", generation: event.generation }
    }

    case "validation_passed": {
      if (state.run !== "validating") return state
      return { ...state, run: "complete", generation: event.generation }
    }

    case "validation_failed": {
      if (state.run !== "validating") return state
      const failures = state.validationFailures + 1
      const attempts = state.kickoff?.validationAttempts ?? DEFAULT_VALIDATION_ATTEMPTS
      if (failures >= attempts) {
        return {
          ...state,
          run: "escalated",
          generation: event.generation,
          validationFailures: failures,
          escalation: "validation_budget",
        }
      }
      // Back to `active` with no resume, per AES-26. Carrying the failure into a
      // new turn arrives with the validation-contract runner, which is a follow-on.
      return { ...state, run: "active", generation: event.generation, validationFailures: failures }
    }

    case "fence_applied": {
      // A session still `idle` is not under policy; fencing it would be the
      // policy making itself visible where it is not in use.
      if (state.run === "idle") return state
      return { ...state, run: "escalated", generation: event.generation, escalation: "fence_applied" }
    }

    case "cancelled": {
      if (state.run === "idle") return state
      return { ...state, run: "failed", generation: event.generation, failure: "cancelled" }
    }
  }
}

function directivesFor(
  before: PolicyState,
  event: PolicyEvent,
  after: PolicyState,
): Directive[] {
  const directives: Directive[] = []
  if (after.run === before.run) return directives

  directives.push({ type: "publish", state: after.run, evidence: evidenceOf(after) })

  // Read the context off `before`: entering `active` is what consumes it.
  if (event.type === "resume_issued" && after.run === "active") {
    directives.push({ type: "resume", message: before.pendingResume ?? "" })
  }
  if (after.run === "escalated" && after.escalation) {
    directives.push({ type: "escalate", reason: after.escalation, evidence: evidenceOf(after) })
  }
  if (after.run === "failed") {
    directives.push({ type: "abort" })
  }
  return directives
}

/**
 * Apply one incoming event and settle.
 *
 * `resume_requested` is a decision point, not a resting place, so it is settled
 * here rather than left for the binding to notice — which is what keeps "a
 * resume is issued only from `resume_requested`" true by construction. Settling
 * is a single fixed step, not a loop: `resume_issued` lands in `active` or
 * `escalated`, neither of which requests another resume.
 */
export function step(state: PolicyState, incoming: PolicyEvent): StepResult {
  const first = reduce(state, incoming)
  const events: PolicyEvent[] = [incoming]
  const directives: Directive[] = [...directivesFor(state, incoming, first)]

  if (first.run !== "resume_requested") {
    return { state: first, events, directives }
  }

  const settling: PolicyEvent = { type: "resume_issued" }
  const second = reduce(first, settling)
  events.push(settling)
  directives.push(...directivesFor(first, settling, second))
  return { state: second, events, directives }
}

/** Fold a whole log. Replaying the same log always yields the same state. */
export function replay(events: readonly PolicyEvent[]): PolicyState {
  return events.reduce(reduce, INITIAL_STATE)
}
