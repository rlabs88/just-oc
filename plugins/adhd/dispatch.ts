/**
 * Subagent dispatch for divergent branches.
 *
 * One child session per branch, opened through the OpenCode client the plugin is
 * already attached to. Isolation is a property of the session graph: a child
 * session starts empty, so a branch carries exactly the brief it is given and
 * nothing from a sibling.
 *
 * This bundle owns its dispatch rather than borrowing one. The engine needs a
 * composed, synchronous call — open, prompt, return text — because its phases are
 * separated by barriers. A background-task surface needs the opposite shape:
 * return the session id immediately and settle later. Those are different
 * contracts, and a single primitive serving both is wider than either needs.
 */

export type DispatchSessionInfo = { id?: string }

export type DispatchTextPart = {
  type?: string
  text?: string
  synthetic?: boolean
}

export type DispatchPromptResult = {
  info?: { error?: unknown }
  parts?: DispatchTextPart[]
}

type Envelope<T> = { data?: T; error?: unknown } | T

export type DispatchClient = {
  session: {
    create: (args: {
      body?: { parentID?: string; title?: string }
    }) => Promise<Envelope<DispatchSessionInfo>>
    prompt: (args: {
      path: { id: string }
      body: {
        agent?: string
        system?: string
        model?: { providerID: string; modelID: string }
        tools?: Record<string, boolean>
        parts: Array<{ type: "text"; text: string }>
      }
    }) => Promise<Envelope<DispatchPromptResult>>
  }
}

export type DispatchRequest = {
  /** Session the branch is parented to, so it stays inside the caller's graph. */
  parentSessionID: string
  title: string
  prompt: string
  /** Per-dispatch system instruction. This is what separates a generator from a critic. */
  system?: string
  agent?: string
  model?: { providerID: string; modelID: string }
  tools?: Record<string, boolean>
}

export type DispatchResult = {
  sessionID: string
  text: string
}

/**
 * Deny-all tool map.
 *
 * Upstream runs branches with no tools at all — "Tools = convergence pressure" —
 * and the same map is what stops a branch re-entering the engine, since a child
 * with no tools cannot call `adhd_run`. The `*` entry is the wildcard form; the
 * explicit ids below it are the fallback for a server that matches literally, and
 * an unmatched key is inert either way.
 */
export const NO_TOOLS: Record<string, boolean> = {
  "*": false,
  read: false,
  glob: false,
  grep: false,
  list: false,
  edit: false,
  write: false,
  patch: false,
  apply_patch: false,
  bash: false,
  webfetch: false,
  task: false,
  todowrite: false,
  todoread: false,
  skill: false,
  adhd_run: false,
  background_task: false,
  background_output: false,
  background_cancel: false,
  zellij: false,
  command_run: false,
}

function unwrap<T>(result: Envelope<T>): T {
  if (result && typeof result === "object" && ("data" in result || "error" in result)) {
    const envelope = result as { data?: T; error?: unknown }
    if (envelope.error) {
      const message =
        envelope.error instanceof Error ? envelope.error.message : JSON.stringify(envelope.error)
      throw new Error(message)
    }
    if (envelope.data === undefined) throw new Error("empty response")
    return envelope.data
  }
  return result as T
}

/** Collect the assistant's own text. Synthetic parts are harness bookkeeping, not output. */
export function extractText(result: DispatchPromptResult): string {
  return (result.parts ?? [])
    .filter((part) => part.type === "text" && !part.synthetic && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("")
    .trim()
}

/** Open a child session and run one prompt in it to completion. */
export async function dispatchAgent(
  client: DispatchClient,
  request: DispatchRequest,
): Promise<DispatchResult> {
  const session = unwrap(
    await client.session.create({
      body: { parentID: request.parentSessionID, title: request.title },
    }),
  )

  const sessionID = session?.id
  if (!sessionID) throw new Error("dispatch failed: session was created without an id")

  const result = unwrap(
    await client.session.prompt({
      path: { id: sessionID },
      body: {
        ...(request.agent ? { agent: request.agent } : {}),
        ...(request.system ? { system: request.system } : {}),
        ...(request.model ? { model: request.model } : {}),
        ...(request.tools ? { tools: request.tools } : {}),
        parts: [{ type: "text", text: request.prompt }],
      },
    }),
  )

  if (result.info?.error) {
    const error = result.info.error
    const message = error instanceof Error ? error.message : JSON.stringify(error)
    throw new Error(`dispatch failed: ${message}`)
  }

  return { sessionID, text: extractText(result) }
}
