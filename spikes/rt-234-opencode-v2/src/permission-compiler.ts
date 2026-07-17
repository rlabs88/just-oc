import type { PermissionConfig } from "@opencode-ai/sdk/v2"

import { adaptHostPermission } from "./host-permission.ts"
import type { ParsedCompilerInputV1 } from "./schema/compiler-input.ts"
import {
  patternedKeys, scalarKeys,
  type PermissionAction, type PermissionPolicy,
} from "./schema/permissions.ts"

const severity: Record<PermissionAction, number> = {
  allow: 0,
  ask: 1,
  deny: 2,
}

export function compilePermissions(input: ParsedCompilerInputV1): PermissionConfig {
  const host = adaptHostPermission(input)
  const overlays = [host, ...input.overlays.map((overlay) => overlay.permissions ?? {})]
  validateOverlayKeys(input.role.permissions, overlays)
  const output: Record<string, unknown> = { "*": "deny" }

  for (const key of patternedKeys) {
    output[key] = compilePatternPolicy(input.role.permissions.patterned[key], key, overlays)
  }
  for (const key of scalarKeys) {
    output[key] = narrow(input.role.permissions.scalar[key], key, overlays)
  }
  output.task = compileTask(input, overlays)
  for (const tool of [...input.role.permissions.customTools].sort(byToolId)) {
    output[tool.toolId] = narrow(tool.action, tool.toolId, overlays)
  }
  return output as PermissionConfig
}

function compilePatternPolicy(
  policy: PermissionPolicy["patterned"][keyof PermissionPolicy["patterned"]],
  key: string,
  overlays: readonly Record<string, PermissionAction>[],
): Record<string, PermissionAction> {
  const output: Record<string, PermissionAction> = {
    "*": narrow(policy.default, key, overlays),
  }
  for (const rule of policy.rules) {
    output[rule.pattern] = narrow(rule.action, key, overlays)
  }
  return output
}

function compileTask(
  input: ParsedCompilerInputV1,
  overlays: readonly Record<string, PermissionAction>[],
): Record<string, PermissionAction> {
  const output: Record<string, PermissionAction> = { "*": "deny" }
  for (const target of input.role.delegation.targets) {
    output[target.roleId] = narrow(target.invocation, "task", overlays)
  }
  return output
}

function narrow(
  source: PermissionAction,
  key: string,
  overlays: readonly Record<string, PermissionAction>[],
): PermissionAction {
  return overlays.reduce((result, overlay) => {
    const candidate = overlay[key] ?? overlay["*"] ?? "allow"
    return severity[candidate] > severity[result] ? candidate : result
  }, source)
}

function validateOverlayKeys(
  policy: PermissionPolicy,
  overlays: readonly Record<string, PermissionAction>[],
): void {
  const custom = policy.customTools.map((tool) => tool.toolId)
  const allowed = new Set(["*", "task", ...patternedKeys, ...scalarKeys, ...custom])
  const unknown = overlays.flatMap(Object.keys).find((key) => !allowed.has(key))
  if (unknown) throw new Error(`Unknown permission overlay key: ${unknown}`)
}

function byToolId(left: { toolId: string }, right: { toolId: string }): number {
  if (left.toolId === right.toolId) return 0
  return left.toolId < right.toolId ? -1 : 1
}
