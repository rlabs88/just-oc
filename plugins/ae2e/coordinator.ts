/**
 * The outbound half of the `CoordinatorChannel` port.
 *
 * The policy publishes state; the coordinator projects it onto Linear. This
 * bundle holds no Linear credential, opens no Linear client, and polls nothing —
 * it POSTs to whatever endpoint the kickoff declared and forgets about it.
 *
 * Publishing fails soft. The state change is already committed to the event log
 * by the time a publication is attempted, so a coordinator that is briefly
 * unreachable must not take the run down with it; the coordinator reconciles by
 * reading state back, which is the same path cold-start recovery will use.
 * There is no retry here on purpose — retries around lifecycle traffic are how
 * an at-least-once channel becomes an unbounded one.
 *
 * A session whose kickoff declared no endpoint publishes nowhere. That is the
 * inert default, and it is what the fake coordinator in the tests stands in for.
 */

import type { CoordinatorChannel, Escalation, StatePublication } from "./ports"

export type CoordinatorPost = (
  endpoint: string,
  payload: Record<string, unknown>,
) => Promise<void>

const post: CoordinatorPost = async (endpoint, payload) => {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(`coordinator responded ${response.status}`)
}

export function createHttpCoordinator(
  send: CoordinatorPost = post,
  onError: (error: unknown, context: string) => void = () => {},
): CoordinatorChannel {
  async function deliver(
    endpoint: string | null,
    context: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (!endpoint) return
    try {
      await send(endpoint, payload)
    } catch (error) {
      onError(error, context)
    }
  }

  return {
    async publishState(publication: StatePublication) {
      await deliver(publication.endpoint, "publishState", {
        type: "ae2e.state",
        sessionID: publication.sessionID,
        issue: publication.issue,
        state: publication.state,
        evidence: publication.evidence,
      })
    },
    async escalate(escalation: Escalation) {
      await deliver(escalation.endpoint, "escalate", {
        type: "ae2e.escalation",
        sessionID: escalation.sessionID,
        issue: escalation.issue,
        reason: escalation.reason,
        evidence: escalation.evidence,
      })
    },
  }
}
