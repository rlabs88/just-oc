import { describe, expect, test } from "bun:test"
import type { Config, PluginInput } from "@opencode-ai/plugin"
import type { AgentConfig, PermissionConfig } from "@opencode-ai/sdk/v2"

import { createArchetypesPlugin } from "../src/plugin.ts"
import { compilerInput, representativeRoles } from "./fixtures.ts"

describe("OpenCode plugin lifecycle adapter", () => {
  test("atomically registers roles while preserving host agents", async () => {
    const harness = createArchetypesPlugin(pluginSpec())
    const hooks = await harness.plugin({} as PluginInput)
    const config: RuntimeConfig = {
      agent: { legacy_agent: { description: "host agent" } },
      permission: { bash: "deny" },
    }

    await hooks.config!(config as unknown as Config)

    expect(Object.keys(config.agent)).toEqual(["legacy_agent", ...roleIds()])
    const permission = config.agent.cortex?.permission as Record<string, unknown>
    expect(permission.bash).toEqual({
      "*": "deny",
      "rm *": "deny",
    })
    expect(harness.lifecycle()).toBe("ready")
  })

  test("rejects occupied IDs without partially mutating config", async () => {
    const harness = createArchetypesPlugin(pluginSpec())
    const hooks = await harness.plugin({} as PluginInput)
    const config: RuntimeConfig = {
      agent: { cortex: { description: "host cortex" } },
    }
    const before = structuredClone(config)

    expect(hooks.config!(config as unknown as Config)).rejects.toThrow("occupied")
    expect(config).toEqual(before)
  })

  test("supports repeat config and idempotent disposal without stale roles", async () => {
    const harness = createArchetypesPlugin(pluginSpec())
    const hooks = await harness.plugin({} as PluginInput)
    const config: RuntimeConfig = { agent: {} }

    await hooks.config!(config as unknown as Config)
    await hooks.config!(config as unknown as Config)
    expect(Object.keys(config.agent)).toEqual(roleIds())

    await hooks.dispose!()
    await hooks.dispose!()
    expect(harness.lifecycle()).toBe("disposed")
    expect(hooks.config!(config as unknown as Config)).rejects.toThrow("disposed")
  })
})

function pluginSpec() {
  return {
    sharedPrompts: compilerInput.sharedPrompts,
    registry: compilerInput.registry,
    overlays: compilerInput.overlays,
    pins: compilerInput.pins,
  }
}

function roleIds(): string[] {
  return representativeRoles.map((role) => role.id)
}

type RuntimeConfig = {
  agent: Record<string, AgentConfig>
  permission?: PermissionConfig
}
