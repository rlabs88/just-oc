import type { Plugin } from "@opencode-ai/plugin"
import { registerArchetypes } from "./harness"
import { createArchetypeHooks } from "./hooks"
import {
  archetypeRegistry,
  collectSelectedHooks,
  collectSelectedPlugins,
  validateRegistry,
} from "./registry"

export const namespace = "@just-oc/agent-archetype-system"
export const displayName = "Agent Archetype System"
export const selectedPlugins = collectSelectedPlugins(archetypeRegistry)
export const selectedHooks = collectSelectedHooks(archetypeRegistry)

const AgentArchetypeSystemPlugin: Plugin = async () => {
  validateRegistry(archetypeRegistry)
  return {
    config: async (config) => {
      registerArchetypes(config, archetypeRegistry)
    },
    ...createArchetypeHooks(archetypeRegistry),
  }
}

export default AgentArchetypeSystemPlugin
