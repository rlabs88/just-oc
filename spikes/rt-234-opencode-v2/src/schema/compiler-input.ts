import { z } from "zod"

import { nonEmpty, scalar, uniqueIdentifiers, uniqueScalars } from "./common.ts"
import { permissionAction } from "./permissions.ts"
import { roleSourceSchema } from "./role.ts"

const hostPermissionValue = z.union([
  permissionAction,
  z.record(z.string(), permissionAction),
])
export const hostPermissionSchema = z.union([
  permissionAction,
  z.record(z.string(), hostPermissionValue),
])

export const capabilityRegistry = z.strictObject({
  roles: z.array(roleSourceSchema).min(1),
  occupiedAgentIds: uniqueScalars,
  modelIds: uniqueScalars,
  pluginIds: uniqueScalars,
  hookIds: uniqueScalars,
  skillIds: uniqueScalars,
  customToolIds: uniqueScalars,
}).superRefine((value, context) => {
  const ids = value.roles.map((role) => role.id)
  if (new Set(ids).size === ids.length) return
  context.addIssue({ code: "custom", message: "Registry role IDs must be unique" })
})

export const overlay = z.strictObject({
  layer: z.enum(["organization", "repository", "project", "session"]),
  enabled: z.literal(false).optional(),
  model: scalar.optional(),
  variant: scalar.optional(),
  temperature: z.number().finite().optional(),
  steps: z.number().int().positive().optional(),
  permissions: z.record(z.string(), permissionAction).optional(),
})

export const compilerInputSchema = z.strictObject({
  schemaVersion: z.literal(1),
  role: roleSourceSchema,
  sharedPrompts: z.strictObject({
    identity: nonEmpty,
    security: nonEmpty,
    task: nonEmpty,
  }),
  registry: capabilityRegistry,
  hostPermission: hostPermissionSchema.optional(),
  overlays: z.array(overlay),
  pins: z.strictObject({
    compilerVersion: scalar,
    opencodeVersion: z.literal("1.17.5"),
    pluginSdkVersion: z.literal("1.17.5"),
  }),
})

export type CompilerInputV1 = z.input<typeof compilerInputSchema>
export type ParsedCompilerInputV1 = z.output<typeof compilerInputSchema>
