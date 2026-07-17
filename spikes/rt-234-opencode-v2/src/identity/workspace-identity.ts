import { createHash } from "node:crypto"

export type WorkspaceClaimInput = {
  kind: "git-local-uuid" | "opencode-project"
  sourceId: string
}

export function encodeWorkspaceClaim(claim: WorkspaceClaimInput): string {
  return ["just-oc.workspace.v1", claim.kind, claim.sourceId].join("\0")
}

export function deriveWorkspaceId(claim: WorkspaceClaimInput): string {
  const digest = createHash("sha256")
    .update(encodeWorkspaceClaim(claim))
    .digest("hex")
  return `ws_${digest}`
}
