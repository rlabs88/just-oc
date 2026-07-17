import { z } from "zod"

import { digest, preservedText, scalar, semanticVersion, uniqueScalars } from "./common.ts"
import { permissionAction } from "./permissions.ts"

const compiledPermissionValue = z.union([
  permissionAction,
  z.record(z.string(), permissionAction),
])

export const emittedAgentConfigSchema = z.strictObject({
  description: scalar,
  mode: z.enum(["primary", "subagent", "all"]),
  hidden: z.boolean(),
  prompt: preservedText.refine((value) => {
    return value.endsWith("\n") && !value.endsWith("\n\n")
  }, {
    message: "Compiled prompt must have one terminal newline",
  }),
  model: scalar,
  variant: scalar.optional(),
  temperature: z.number().finite().min(0).max(2),
  steps: z.number().int().positive(),
  permission: z.record(z.string(), compiledPermissionValue),
})

export const bindingSchema = z.strictObject({
  plugins: uniqueScalars,
  hooks: uniqueScalars,
  skills: uniqueScalars,
})

export const provenanceSchema = z.strictObject({
  schemaVersion: z.literal(1),
  roleId: scalar,
  roleVersion: semanticVersion,
  roleSourceDigest: digest,
  policyDigest: digest,
  sharedPromptDigests: z.strictObject({
    identity: digest,
    security: digest,
    task: digest,
  }),
  compilerVersion: scalar,
  opencodeVersion: z.literal("1.17.5"),
  pluginSdkVersion: z.literal("1.17.5"),
  overlayDigest: digest,
  bindingDigest: digest,
  outputDigest: digest,
  decisionRefs: uniqueScalars,
})

export const compiledRoleSchema = z.strictObject({
  agentId: scalar,
  agentConfig: emittedAgentConfigSchema,
  binding: bindingSchema,
  provenance: provenanceSchema,
})

export type CompiledRoleV1 = z.infer<typeof compiledRoleSchema>
