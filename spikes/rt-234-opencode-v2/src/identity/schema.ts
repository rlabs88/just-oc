import { z } from "zod"

import { digest, identifier, scalar, semanticVersion } from "../schema/common.ts"
import { deriveWorkspaceId } from "./workspace-identity.ts"

const identityId = z.string().regex(
  /^just-oc\.agent\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/,
)
const workspaceId = z.string().regex(/^ws_[a-f0-9]{64}$/)
const workspaceClaim = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("git-local-uuid"), sourceId: z.uuid() }),
  z.strictObject({ kind: z.literal("opencode-project"), sourceId: scalar }),
])

const generationObject = z.strictObject({
  identitySchemaVersion: z.literal(1),
  identityId,
  workspaceId,
  workspaceClaim,
  roleId: identifier,
  roleVersion: semanticVersion,
  roleSourceDigest: digest,
  policyDigest: digest,
  generation: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  migratedFrom: z.number().int().positive().optional(),
})
export const identityGenerationSchema = generationObject.superRefine(
  ({ identityId: canonicalId, roleId, workspaceId: id, workspaceClaim: claim }, context) => {
    if (canonicalId !== `just-oc.agent/${roleId}`) context.addIssue({
      code: "custom", path: ["identityId"],
      message: "Canonical identity ID must match the role ID",
    })
    if (id !== deriveWorkspaceId(claim)) context.addIssue({
      code: "custom", path: ["workspaceId"],
      message: "Workspace ID must match the canonical workspace claim",
    })
  },
)

export const identityControlSchema = z.strictObject({
  schemaVersion: z.literal(1),
  identityId,
  status: z.enum(["active", "archived", "revoked"]),
  statusEpoch: z.number().int().positive(),
  activeGeneration: z.number().int().positive(),
  controlVersion: z.number().int().positive(),
  updatedAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().optional(),
  revokedBy: scalar.optional(),
  revocationReason: scalar.optional(),
})

export const identityInputSchema = generationObject.omit({
  identitySchemaVersion: true,
  generation: true,
  createdAt: true,
  updatedAt: true,
  migratedFrom: true,
}).superRefine((value, context) => {
  if (value.identityId !== `just-oc.agent/${value.roleId}`) context.addIssue({
    code: "custom", path: ["identityId"],
    message: "Canonical identity ID must match the role ID",
  })
  if (value.workspaceId !== deriveWorkspaceId(value.workspaceClaim)) context.addIssue({
    code: "custom", path: ["workspaceId"],
    message: "Workspace ID must match the canonical workspace claim",
  })
})

export const migrationInputSchema = identityGenerationSchema.pick({
  roleVersion: true,
  roleSourceDigest: true,
  policyDigest: true,
})

export const journalEventSchema = z.strictObject({
  type: z.enum(["generation-committed", "recovered", "revoked"]),
  identityId,
  generation: z.number().int().positive(),
  controlVersion: z.number().int().positive(),
  timestamp: z.iso.datetime(),
})

export type IdentityGeneration = z.infer<typeof identityGenerationSchema>
export type IdentityControl = z.infer<typeof identityControlSchema>
export type IdentityInput = z.input<typeof identityInputSchema>
export type MigrationInput = z.input<typeof migrationInputSchema>
export type JournalEvent = z.infer<typeof journalEventSchema>
