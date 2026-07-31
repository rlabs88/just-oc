/**
 * The two ports this ticket binds.
 *
 * They are declared here, away from both the core and the binding, so the core
 * stays free of host types and a test can drive the whole policy against a fake
 * coordinator. `AdvisorChannel` is deliberately absent — the advisor
 * conversation is a declared follow-on, and a port with no implementation is a
 * contract nobody has had to satisfy yet.
 *
 * Outbound calls carry a session id because one server hosts many sessions and
 * a port that assumed a single bound session would be a scoping bug waiting to
 * happen.
 */

import type { EscalationReason, Evidence, RunState } from "./policy"
import type { LifecycleEnvelope } from "./envelope"

/**
 * `endpoint` is the publish address the kickoff declared. It travels with the
 * publication rather than being configured into the channel because the
 * coordinator's address is part of the kickoff contract, and because a session
 * that was never told where to publish must not inherit another session's
 * endpoint. A fake coordinator ignores it.
 */
export type StatePublication = {
  readonly sessionID: string
  readonly issue: string | null
  readonly state: RunState
  readonly evidence: Evidence
  readonly endpoint: string | null
}

export type Escalation = {
  readonly sessionID: string
  readonly issue: string | null
  readonly reason: EscalationReason
  readonly evidence: Evidence
  readonly endpoint: string | null
}

/**
 * The host harness, reduced to what park and resume need.
 *
 * `reply` is the whole park/resume primitive: injecting a message with
 * `reply: false` leaves the session idle, and with `reply: true` starts a new
 * turn. `readTranscript` is not here; it arrives with cold-start recovery.
 */
export interface AgentRuntime {
  resume(sessionID: string, message: string, reply: boolean): Promise<void>
  abort(sessionID: string): Promise<void>
}

/** Outbound half of the coordinator port. The policy publishes; it never writes Linear. */
export interface CoordinatorChannel {
  publishState(publication: StatePublication): Promise<void>
  escalate(escalation: Escalation): Promise<void>
}

/** Inbound half. The plugin hooks call exactly these two methods and nothing else. */
export interface PolicyInbound {
  onTurnComplete(sessionID: string): Promise<void>
  onLifecycleEvent(sessionID: string, envelope: LifecycleEnvelope): Promise<void>
}
