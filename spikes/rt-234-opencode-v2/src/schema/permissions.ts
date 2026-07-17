import { z } from "zod"

import { nonEmpty } from "./common.ts"

export const permissionAction = z.enum(["allow", "ask", "deny"])
const patternRule = z.strictObject({
  pattern: nonEmpty.refine((value) => value !== "*", {
    message: "Use default for the catch-all rule",
  }),
  action: permissionAction,
})

const patternPolicy = z.strictObject({
  default: permissionAction,
  rules: z.array(patternRule).superRefine((rules, context) => {
    const patterns = rules.map((rule) => rule.pattern)
    if (new Set(patterns).size === patterns.length) return
    context.addIssue({ code: "custom", message: "Patterns must be unique" })
  }),
})

export const patternedKeys = [
  "read", "edit", "glob", "grep", "list", "bash",
  "external_directory", "lsp", "skill",
] as const

export const scalarKeys = [
  "todowrite", "question", "webfetch", "websearch", "doom_loop",
] as const

const customTool = z.strictObject({
  toolId: z.string().regex(/^[A-Za-z0-9_.:-]+$/),
  action: permissionAction,
})

export const permissionPolicy = z.strictObject({
  defaultToolAction: z.literal("deny"),
  patterned: z.strictObject(Object.fromEntries(
    patternedKeys.map((key) => [key, patternPolicy]),
  ) as Record<(typeof patternedKeys)[number], typeof patternPolicy>),
  scalar: z.strictObject(Object.fromEntries(
    scalarKeys.map((key) => [key, permissionAction]),
  ) as Record<(typeof scalarKeys)[number], typeof permissionAction>),
  customTools: z.array(customTool),
}).superRefine((value, context) => {
  const ids = value.customTools.map((tool) => tool.toolId)
  if (new Set(ids).size === ids.length) return
  context.addIssue({ code: "custom", message: "Custom tool permissions must be unique" })
})

export type PermissionAction = z.infer<typeof permissionAction>
export type PermissionPolicy = z.infer<typeof permissionPolicy>
