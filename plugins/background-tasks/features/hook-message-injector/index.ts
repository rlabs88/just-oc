/**
 * Simplified stub for resolveMessageContext.
 * The original in oh-my-openagent reads session messages from disk/SDK
 * to resolve the previous message context (agent, model info).
 * This stub returns null values - the background task tool handles null gracefully.
 */

type StoredMessage = {
  agent?: string
  model?: {
    providerID?: string
    modelID?: string
    variant?: string
  }
} | null

type OpencodeClient = {
  session: {
    messages: (args: { path: { id: string } }) => Promise<unknown>
  }
}

export async function resolveMessageContext(
  _sessionID: string,
  _client: OpencodeClient,
  _messageDir: string | null
): Promise<{ prevMessage: StoredMessage; firstMessageAgent: string | null }> {
  return { prevMessage: null, firstMessageAgent: null }
}
