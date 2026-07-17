import { cortex } from "./roles/cortex"
import { flux } from "./roles/flux"
import { zen } from "./roles/zen"
import {
  HOOK_IDS,
  PLUGIN_IDS,
  ROLE_IDS,
  type ArchetypeConfig,
  type ArchetypeHookId,
  type ArchetypeRegistry,
  type HarnessOptions,
  type IndependentPluginId,
  type RoleId,
} from "./types"

export const archetypeRegistry = {
  cortex,
  flux,
  zen,
} satisfies ArchetypeRegistry

const roleIds = new Set<string>(ROLE_IDS)
const pluginIds = new Set<string>(PLUGIN_IDS)
const hookIds = new Set<string>(HOOK_IDS)

export function resolveArchetype(
  id: string,
  registry: ArchetypeRegistry = archetypeRegistry,
): ArchetypeConfig | undefined {
  if (!roleIds.has(id)) return undefined
  return registry[id as RoleId]
}

export function enabledArchetypes(
  registry: ArchetypeRegistry = archetypeRegistry,
  options: HarnessOptions = {},
): ArchetypeConfig[] {
  return ROLE_IDS.flatMap((id) => {
    const role = registry[id]
    const enabled = options.enabled?.[id] ?? role.enabled
    return enabled ? [role] : []
  })
}

export function collectSelectedPlugins(
  registry: ArchetypeRegistry = archetypeRegistry,
  options: HarnessOptions = {},
): IndependentPluginId[] {
  return [...new Set(enabledArchetypes(registry, options).flatMap((role) => role.plugins))]
}

export function collectSelectedHooks(
  registry: ArchetypeRegistry = archetypeRegistry,
  options: HarnessOptions = {},
): ArchetypeHookId[] {
  return [...new Set(enabledArchetypes(registry, options).flatMap((role) => role.hooks))]
}

export function validateRegistry(registry: ArchetypeRegistry = archetypeRegistry): void {
  for (const id of ROLE_IDS) {
    const role = registry[id]
    if (role.id !== id) fail(`Registry key ${id} does not match role ID ${role.id}`)
    validateUnique(role.plugins, `${id} plugin`)
    validateUnique(role.hooks, `${id} hook`)

    for (const plugin of role.plugins) {
      if (!pluginIds.has(plugin)) fail(`Unknown plugin reference: ${plugin}`)
    }
    for (const hook of role.hooks) {
      if (!hookIds.has(hook)) fail(`Unknown hook reference: ${hook}`)
    }
    validatePortablePrompt(role)
  }
}

function validateUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) fail(`Duplicate ${label} reference`)
}

function validatePortablePrompt(role: ArchetypeConfig): void {
  const additions = [
    role.prompts.identity,
    ...role.prompts.security,
    role.prompts.task,
  ].join("\n")
  const forbidden = [
    /(?:^|\s)\/(?:Users|home)\/[\w.-]+\//,
    /[A-Za-z]:\\Users\\/,
    /(?:^|\s)~\//,
    /\b(?:sk|ghp|github_pat)_[A-Za-z0-9_-]{8,}\b/,
    /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
  ]
  if (forbidden.some((pattern) => pattern.test(additions))) {
    fail(`Role prompt contains non-portable or sensitive content: ${role.id}`)
  }
}

function fail(message: string): never {
  throw new Error(message)
}
