/**
 * The `AgentRuntime` port, bound to OpenCode.
 *
 * Park and resume are not built here — they already exist as host primitives.
 * `session.promptAsync` takes a `noReply` flag, so the same call either drops a
 * message into the transcript and leaves the session idle, or drops it in and
 * starts a turn with it. That is the entire mechanism, and it is why a parked
 * AE2E run holds no turn, no timer, and no poll: parking is the absence of a
 * call, not a call that waits.
 *
 * The client is described structurally rather than by importing the SDK's
 * client type, following the same practice as the other bundles here: the
 * binding states the narrow surface it actually uses, and a fake can satisfy it.
 */

import type { AgentRuntime } from "./ports"

export type RuntimeClient = {
  session: {
    promptAsync: (args: {
      path: { id: string }
      body: {
        noReply?: boolean
        parts: Array<{ type: "text"; text: string; metadata?: Record<string, unknown> }>
      }
    }) => Promise<unknown>
    abort: (args: { path: { id: string } }) => Promise<unknown>
  }
}

/** Marks a part this policy wrote, so a transcript reader can tell it apart. */
export const POLICY_METADATA_KEY = "ae2e.policy"
export const RESUME_MARKER = "resume"

export function createOpencodeRuntime(client: RuntimeClient): AgentRuntime {
  return {
    async resume(sessionID, message, reply) {
      await client.session.promptAsync({
        path: { id: sessionID },
        body: {
          noReply: !reply,
          parts: [
            {
              type: "text",
              text: message,
              metadata: { [POLICY_METADATA_KEY]: RESUME_MARKER },
            },
          ],
        },
      })
    },
    async abort(sessionID) {
      await client.session.abort({ path: { id: sessionID } })
    },
  }
}
