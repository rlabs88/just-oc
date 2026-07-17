import type { ParsedCompilerInputV1 } from "./schema/compiler-input.ts"
import {
  patternedKeys, scalarKeys,
  type PermissionAction, type PermissionPolicy,
} from "./schema/permissions.ts"

export function adaptHostPermission(
  input: ParsedCompilerInputV1,
): Record<string, PermissionAction> {
  const host = input.hostPermission
  if (host === undefined) return {}
  if (typeof host === "string") return { "*": host }

  const allowed = permissionKeys(input.role.permissions)
  return Object.fromEntries(Object.entries(host).map(([key, value]) => {
    if (typeof value !== "string") {
      throw new Error(`Granular host permission is unsupported in v1: ${key}`)
    }
    if (!allowed.has(key)) throw new Error(`Unsupported host permission key: ${key}`)
    return [key, value]
  }))
}

function permissionKeys(policy: PermissionPolicy): Set<string> {
  const custom = policy.customTools.map((tool) => tool.toolId)
  return new Set(["*", "task", ...patternedKeys, ...scalarKeys, ...custom])
}
