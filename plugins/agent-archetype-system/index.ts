import type { Plugin } from "@opencode-ai/plugin"
import { registerArchetypes } from "./harness"
import { createArchetypeHooks } from "./hooks"
import {
  archetypeRegistry,
  collectSelectedHooks,
  collectSelectedPlugins,
  validateRegistry,
} from "./registry"
import type { OpenCodeV2Config } from "./types"

export const namespace = "@just-oc/agent-archetype-system"
export const displayName = "Agent Archetype System"
export const selectedPlugins = collectSelectedPlugins(archetypeRegistry)
export const selectedHooks = collectSelectedHooks(archetypeRegistry)

const AgentArchetypeSystemPlugin: Plugin = async () => {
  validateRegistry(archetypeRegistry)
  return {
    config: async (config) => {
      // @opencode-ai/plugin 1.17.5 still types this hook through the legacy SDK
      // export. OpenCode passes the V2 config object at runtime, so the adapter is
      // deliberately confined to this host boundary.
      registerArchetypes(config as unknown as OpenCodeV2Config, archetypeRegistry)
    },
    ...createArchetypeHooks(archetypeRegistry),
  }
}

export default AgentArchetypeSystemPlugin
