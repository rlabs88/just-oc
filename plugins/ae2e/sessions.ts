/**
 * Per-session policy instances.
 *
 * One OpenCode server hosts many sessions — subagents, background tasks,
 * unrelated conversations — and the only turn-boundary signal a plugin gets is
 * server-wide. This file is where that becomes safe: an instance exists only for
 * a session that received a control-plane kickoff, and every inbound fact is
 * addressed to exactly one instance by session id. A session with no instance
 * is untouched, which is what makes the bundle invisible when the policy is not
 * in use.
 *
 * State transitions happen synchronously so two inbound facts can never
 * interleave mid-fold. Directive execution is asynchronous and serialised per
 * session, so a publish for an earlier state can never overtake a later one.
 */

import {
  INITIAL_STATE,
  step,
  type Directive,
  type Kickoff,
  type PolicyEvent,
  type PolicyState,
} from "./policy"
import { toPolicyEvent, type LifecycleEnvelope } from "./envelope"
import type {
  AgentRuntime,
  CoordinatorChannel,
  PolicyInbound,
} from "./ports"

export type PolicySetOptions = {
  readonly runtime: AgentRuntime
  readonly coordinator: CoordinatorChannel
  /**
   * Where a failed directive goes. Directives are never retried: the state
   * change is already committed to the log, and a retry loop around a resume is
   * exactly the runaway this policy exists to prevent.
   */
  readonly onError?: (error: unknown, context: string) => void
}

export type PolicySnapshot = {
  readonly sessionID: string
  readonly state: PolicyState
  readonly log: readonly PolicyEvent[]
}

export type PolicySet = PolicyInbound & {
  /** Latch a turn open. Driven by the host's busy signal, and idempotent. */
  onTurnStart(sessionID: string): void
  snapshot(sessionID: string): PolicySnapshot | null
  readonly bound: readonly string[]
  /** Resolves once every queued directive has run. Test seam only. */
  settled(): Promise<void>
}

type Instance = {
  readonly sessionID: string
  readonly log: PolicyEvent[]
  state: PolicyState
  endpoint: string | null
  /** A turn is open between the host's busy signal and its idle signal. */
  turnOpen: boolean
  queue: Promise<void>
}

function kickoffOf(envelope: LifecycleEnvelope): Kickoff | null {
  // The parser already refused a kickoff missing either field; this narrows the
  // optional wire types down to the frozen record the core holds.
  if (!envelope.validationContract) return null
  if (!envelope.resumeCeiling || !envelope.validationAttempts) return null
  return {
    issue: envelope.issue,
    validationContract: envelope.validationContract,
    resumeCeiling: envelope.resumeCeiling,
    validationAttempts: envelope.validationAttempts,
  }
}

export function createPolicySet(options: PolicySetOptions): PolicySet {
  const { runtime, coordinator } = options
  const report = options.onError ?? (() => {})
  const instances = new Map<string, Instance>()

  async function execute(instance: Instance, directives: readonly Directive[]): Promise<void> {
    for (const directive of directives) {
      try {
        switch (directive.type) {
          case "resume":
            await runtime.resume(instance.sessionID, directive.message, true)
            break
          case "abort":
            await runtime.abort(instance.sessionID)
            break
          case "publish":
            await coordinator.publishState({
              sessionID: instance.sessionID,
              issue: instance.state.kickoff?.issue ?? null,
              state: directive.state,
              evidence: directive.evidence,
              endpoint: instance.endpoint,
            })
            break
          case "escalate":
            await coordinator.escalate({
              sessionID: instance.sessionID,
              issue: instance.state.kickoff?.issue ?? null,
              reason: directive.reason,
              evidence: directive.evidence,
              endpoint: instance.endpoint,
            })
            break
        }
      } catch (error) {
        report(error, `${directive.type} for ${instance.sessionID}`)
      }
    }
  }

  function apply(instance: Instance, event: PolicyEvent): Promise<void> {
    const result = step(instance.state, event)
    instance.log.push(...result.events)
    instance.state = result.state
    if (result.directives.length === 0) return instance.queue
    instance.queue = instance.queue.then(() => execute(instance, result.directives))
    return instance.queue
  }

  async function onLifecycleEvent(
    sessionID: string,
    envelope: LifecycleEnvelope,
  ): Promise<void> {
    const existing = instances.get(sessionID)

    if (envelope.kind === "kickoff") {
      // A kickoff for an already-bound session is not a rebind. It is routed
      // into the core anyway so the `activated`-outside-`idle` guard is the one
      // authority on refusing it, and so the log records that it arrived.
      const kickoff = kickoffOf(envelope)
      if (!kickoff) return
      const instance =
        existing ??
        ({
          sessionID,
          log: [],
          state: INITIAL_STATE,
          endpoint: envelope.publishUrl ?? null,
          turnOpen: false,
          queue: Promise.resolve(),
        } satisfies Instance)
      instances.set(sessionID, instance)
      await apply(instance, { type: "activated", generation: envelope.generation, kickoff })
      return
    }

    if (!existing) return
    // Right session, wrong issue: a mis-addressed envelope must not steer a run
    // it does not belong to.
    if (existing.state.kickoff && existing.state.kickoff.issue !== envelope.issue) return

    const event = toPolicyEvent(envelope)
    if (!event) return
    await apply(existing, event)
  }

  function onTurnStart(sessionID: string): void {
    const instance = instances.get(sessionID)
    if (!instance) return
    instance.turnOpen = true
  }

  async function onTurnComplete(sessionID: string): Promise<void> {
    const instance = instances.get(sessionID)
    if (!instance) return
    // The latch is what makes detection exactly-once: a second idle for a turn
    // that already closed finds no open turn and is dropped.
    if (!instance.turnOpen) return
    instance.turnOpen = false
    await apply(instance, { type: "turn_completed" })
  }

  return {
    onLifecycleEvent,
    onTurnComplete,
    onTurnStart,
    snapshot(sessionID) {
      const instance = instances.get(sessionID)
      if (!instance) return null
      return { sessionID, state: instance.state, log: [...instance.log] }
    },
    get bound() {
      return [...instances.keys()]
    },
    async settled() {
      await Promise.all([...instances.values()].map((instance) => instance.queue))
    },
  }
}
