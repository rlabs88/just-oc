import type { Config, Plugin } from "@opencode-ai/plugin"
import type { AgentConfig, PermissionConfig } from "@opencode-ai/sdk/v2"

import { compileRole } from "./compiler.ts"
import type { CompilerInputV1 } from "./role-schema.ts"
import { hostPermissionSchema } from "./schema/compiler-input.ts"

export type PluginLifecycle = "created" | "initialized" | "ready" | "disposing" | "disposed"

export type ArchetypesPluginSpec = Pick<
  CompilerInputV1,
  "sharedPrompts" | "registry" | "overlays" | "pins"
>

export type ArchetypesPluginHarness = {
  plugin: Plugin
  lifecycle(): PluginLifecycle
}

type MutableRuntimeConfig = {
  agent?: Record<string, AgentConfig>
  permission?: PermissionConfig
}

export function createArchetypesPlugin(
  spec: ArchetypesPluginSpec,
): ArchetypesPluginHarness {
  let lifecycle: PluginLifecycle = "created"
  let owned = new Set<string>()
  let disposal: Promise<void> | undefined

  const plugin: Plugin = async () => {
    assertUsable(lifecycle)
    if (lifecycle === "created") lifecycle = "initialized"
    return {
      config: async (config: Config) => {
        assertUsable(lifecycle)
        const runtime = config as unknown as MutableRuntimeConfig
        const hostAgents = withoutOwned(runtime.agent ?? {}, owned)
        const occupied = [...new Set([
          ...spec.registry.occupiedAgentIds,
          ...Object.keys(hostAgents),
        ])]
        const registry = { ...spec.registry, occupiedAgentIds: occupied }
        const hostPermission = runtime.permission === undefined
          ? undefined
          : hostPermissionSchema.parse(runtime.permission)
        const compiled: Record<string, AgentConfig> = {}
        for (const role of registry.roles) {
          if (!role.enabled) continue
          const result = compileRole({
            schemaVersion: 1,
            role,
            sharedPrompts: spec.sharedPrompts,
            registry,
            ...(hostPermission ? { hostPermission } : {}),
            overlays: spec.overlays,
            pins: spec.pins,
          })
          compiled[result.agentId] = result.agentConfig as AgentConfig
        }
        runtime.agent = { ...hostAgents, ...compiled }
        owned = new Set(Object.keys(compiled))
        lifecycle = "ready"
      },
      dispose: () => {
        if (disposal) return disposal
        lifecycle = "disposing"
        disposal = Promise.resolve().then(() => {
          owned.clear()
          lifecycle = "disposed"
        })
        return disposal
      },
    }
  }

  return { plugin, lifecycle: () => lifecycle }
}

function withoutOwned(
  agents: Record<string, AgentConfig>,
  owned: ReadonlySet<string>,
): Record<string, AgentConfig> {
  return Object.fromEntries(Object.entries(agents).filter(([id]) => !owned.has(id)))
}

function assertUsable(lifecycle: PluginLifecycle): void {
  if (lifecycle === "disposing" || lifecycle === "disposed") {
    throw new Error("OpenCode plugin is disposed")
  }
}
