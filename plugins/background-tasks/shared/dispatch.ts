/**
 * Session dispatch for background tasks. Bundle-private.
 *
 * One child session per task, driven through the OpenCode server the plugin is
 * already attached to.
 *
 * The create and prompt steps are deliberately separate. A background task must
 * report its session id the moment `launch` returns — a task with no session
 * cannot be inspected or cancelled — while the prompt settles long afterwards.
 * `dispatchAgent`-style composition would force the caller to wait for the whole
 * run, which is exactly what this surface exists not to do.
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

export type ParentNotificationClient = {
  session: {
    promptAsync: (args: {
      path: { id: string }
      body: {
        noReply: true
        parts: Array<{ type: "text"; text: string }>
      }
    }) => Promise<Envelope<void>>
  }
}

export type DispatchRequest = {
  /** Session the child is parented to, so the dispatch stays inside the caller's graph. */
  parentSessionID: string
  title: string
  prompt: string
  /** Per-dispatch system instruction. This is what separates a generator from a critic. */
  system?: string
  agent?: string
  model?: { providerID: string; modelID: string }
  /** Tool availability for the child. Omit to inherit the agent's own catalog. */
  tools?: Record<string, boolean>
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

/**
 * Open the child session.
 *
 * Split from the prompt so a caller that must report the session id before the
 * work finishes — the background manager — can hand it back immediately.
 */
export async function createDispatchSession(
  client: DispatchClient,
  request: Pick<DispatchRequest, "parentSessionID" | "title">,
): Promise<string> {
  const session = unwrap(
    await client.session.create({
      body: { parentID: request.parentSessionID, title: request.title },
    }),
  )

  const sessionID = session?.id
  if (!sessionID) throw new Error("dispatch failed: session was created without an id")
  return sessionID
}

/** Run one prompt in an already-open session to completion. */
export async function runDispatchPrompt(
  client: DispatchClient,
  sessionID: string,
  request: Omit<DispatchRequest, "parentSessionID" | "title">,
): Promise<string> {
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

  return extractText(result)
}

/** Inject a host-visible reminder without starting another model response. */
export async function notifyDispatchParent(
  client: ParentNotificationClient,
  parentSessionID: string,
  text: string,
): Promise<void> {
  const result = await client.session.promptAsync({
    path: { id: parentSessionID },
    body: {
      noReply: true,
      parts: [{ type: "text", text }],
    },
  })

  if (result && typeof result === "object" && "error" in result && result.error) {
    const message = result.error instanceof Error ? result.error.message : JSON.stringify(result.error)
    throw new Error(`parent notification failed: ${message}`)
  }
}
