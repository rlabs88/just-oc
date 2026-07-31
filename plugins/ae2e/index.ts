/**
 * AE2E runtime policy — the OpenCode entry point.
 *
 * Two hooks, and nothing else. No tool is registered, no prompt is altered, no
 * config is touched, and no turn is injected: a session that never receives a
 * control-plane kickoff cannot tell this bundle is loaded.
 *
 * `event` is the only turn-boundary signal OpenCode offers a plugin, and it is
 * server-wide, so both handlers do nothing until `sessions.ts` recognises the
 * session id. `chat.message` is the envelope intake — it fires for `user`-role
 * messages, including the ones `promptAsync` injects with `noReply`, which is
 * how a parked session hears from the coordinator without waking up.
 */

import type { Plugin } from "@opencode-ai/plugin"
import { createPolicySet, type PolicySet } from "./sessions"
import { createOpencodeRuntime, type RuntimeClient } from "./runtime"
import { createHttpCoordinator } from "./coordinator"
import { readEnvelopes, type EnvelopeCarrier } from "./envelope"

export * from "./policy"
export * from "./envelope"
export * from "./ports"
export { createPolicySet, type PolicySet, type PolicySnapshot } from "./sessions"
export { createOpencodeRuntime, POLICY_METADATA_KEY, type RuntimeClient } from "./runtime"
export { createHttpCoordinator, type CoordinatorPost } from "./coordinator"

/** Where a failed directive or publication goes. Never silently swallowed. */
function warn(error: unknown, context: string): void {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[ae2e] ${context}: ${message}`)
}

export function createPolicySetForClient(client: RuntimeClient): PolicySet {
  return createPolicySet({
    runtime: createOpencodeRuntime(client),
    coordinator: createHttpCoordinator(undefined, warn),
    onError: warn,
  })
}

const Ae2ePlugin: Plugin = async (ctx) => {
  const policies = createPolicySetForClient(ctx.client as unknown as RuntimeClient)

  return {
    event: async ({ event }) => {
      if (event.type === "session.status") {
        // Latching the turn open is what makes the idle below fire exactly once
        // per turn rather than once per idle signal.
        if (event.properties.status.type === "busy") policies.onTurnStart(event.properties.sessionID)
        return
      }
      if (event.type === "session.idle") {
        await policies.onTurnComplete(event.properties.sessionID)
      }
    },

    "chat.message": async (input, output) => {
      const parts = output.parts as unknown as readonly EnvelopeCarrier[]
      const envelopes = readEnvelopes(output.message.role, parts)
      for (const envelope of envelopes) {
        await policies.onLifecycleEvent(input.sessionID, envelope)
      }
    },
  }
}

export default Ae2ePlugin
