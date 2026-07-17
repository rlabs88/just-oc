import { resolveArchetype } from "./registry"
import type {
  ArchetypeHookId,
  ArchetypeRegistry,
  HookRoute,
  OpenCodeHooks,
  RoleId,
} from "./types"

export type HookRouteObserver = (route: HookRoute) => void

export function createArchetypeHooks(
  registry: ArchetypeRegistry,
  observe: HookRouteObserver = () => {},
): OpenCodeHooks {
  const sessions = new Map<string, RoleId>()

  const route = (sessionID: string, hookId: ArchetypeHookId): RoleId | undefined => {
    const roleId = sessions.get(sessionID)
    if (!roleId) return undefined
    const role = resolveArchetype(roleId, registry)
    if (!role?.enabled || !role.hooks.includes(hookId)) return undefined
    observe({ roleId, hookId, sessionID })
    return roleId
  }

  return {
    "chat.message": async (input) => {
      const role = input.agent ? resolveArchetype(input.agent, registry) : undefined
      if (role?.enabled) sessions.set(input.sessionID, role.id)
      else sessions.delete(input.sessionID)
    },
    "tool.execute.before": async (input) => {
      route(input.sessionID, "tool-audit")
    },
    "tool.execute.after": async (input, output) => {
      const roleId = route(input.sessionID, "tool-audit")
      if (!roleId) return
      output.metadata = { ...output.metadata, archetype: roleId }
    },
  }
}
