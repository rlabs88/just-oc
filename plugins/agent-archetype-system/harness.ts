import { baseIdentity } from "./prompts/base-identity"
import { baseTask } from "./prompts/base-task"
import { sharedSecurity } from "./prompts/security"
import { enabledArchetypes, validateRegistry } from "./registry"
import {
  NATIVE_TOOL_PERMISSION_KEYS,
  ROLE_IDS,
  type ArchetypeConfig,
  type ArchetypeRegistry,
  type HarnessOptions,
  type NativeCatalogMode,
  type OpenCodeAgentConfig,
  type OpenCodePermissionConfig,
  type OpenCodeV2Config,
  type RoleId,
} from "./types"

export function composePrompt(role: ArchetypeConfig): string {
  const roleSecurity = role.prompts.security.length > 0
    ? role.prompts.security.map((addition) => `- ${addition}`).join("\n")
    : "No role-specific security additions."

  return [
    section("Base Identity", role.prompts.baseIdentity ?? baseIdentity),
    section("Role Identity", role.prompts.identity),
    section("Shared Security", role.prompts.sharedSecurity ?? sharedSecurity),
    section("Role Security Additions", roleSecurity),
    section("Base Task Behavior", role.prompts.baseTask ?? baseTask),
    section("Role Task Behavior", role.prompts.task),
  ].join("\n\n") + "\n"
}

export function createAgentConfigs(
  registry: ArchetypeRegistry,
  options: HarnessOptions = {},
): Partial<Record<RoleId, OpenCodeAgentConfig>> {
  validateRegistry(registry)
  const enabled = new Set(enabledArchetypes(registry, options).map((role) => role.id))
  return Object.fromEntries(enabledArchetypes(registry, options).map((role) => [
    role.id,
    toAgentConfig(role, enabled, options.catalogMode?.[role.id]),
  ]))
}

export function registerArchetypes(
  config: OpenCodeV2Config,
  registry: ArchetypeRegistry,
  options: HarnessOptions = {},
): void {
  const agents = createAgentConfigs(registry, options)
  config.agent ??= {}
  for (const id of ROLE_IDS) {
    const agent = agents[id]
    if (!agent) continue
    if (config.agent[id]) throw new Error(`OpenCode agent ID is already registered: ${id}`)
    config.agent[id] = agent
  }
}

function toAgentConfig(
  role: ArchetypeConfig,
  enabled: ReadonlySet<RoleId>,
  catalogMode?: NativeCatalogMode,
): OpenCodeAgentConfig {
  return {
    description: role.description,
    mode: role.mode,
    hidden: role.hidden,
    color: role.color,
    model: role.model.model,
    variant: role.model.variant,
    temperature: role.model.temperature,
    top_p: role.model.topP,
    steps: role.model.steps,
    permission: applyNativeToolCatalog(
      filterTaskPermissions(role.permissions, enabled),
      role,
      catalogMode,
    ),
    prompt: composePrompt(role),
  }
}

function applyNativeToolCatalog(
  permissions: OpenCodePermissionConfig,
  role: ArchetypeConfig,
  mode: NativeCatalogMode | undefined,
): OpenCodePermissionConfig {
  const catalog = role.nativeToolCatalog
  if (!catalog || (mode ?? catalog.defaultMode) === "hybrid") return permissions

  const disabled = Object.fromEntries(catalog.disabled.map((tool) => [
    NATIVE_TOOL_PERMISSION_KEYS[tool],
    "deny" as const,
  ]))
  return { ...permissions, ...disabled }
}

function filterTaskPermissions(
  permissions: OpenCodePermissionConfig,
  enabled: ReadonlySet<RoleId>,
): OpenCodePermissionConfig {
  const task = permissions.task
  if (!task || typeof task === "string" || Array.isArray(task)) return permissions

  const filteredTask = Object.fromEntries(Object.entries(task).filter(([target]) => {
    return target === "*" || !ROLE_IDS.includes(target as RoleId) || enabled.has(target as RoleId)
  }))
  return { ...permissions, task: filteredTask }
}

function section(title: string, content: string): string {
  return `# ${title}\n\n${content.trim()}`
}
