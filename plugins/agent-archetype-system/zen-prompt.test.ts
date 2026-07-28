import { describe, expect, test } from "bun:test"
import { composePrompt, createAgentConfigs } from "./harness"
import { archetypeRegistry, validateRegistry } from "./registry"
import { cortex } from "./roles/cortex"
import { flux } from "./roles/flux"
import { zen } from "./roles/zen"
import type { OpenCodeAgentConfig, OpenCodePermissionConfig } from "./types"

// Agent permission is `string | PermissionConfig`; the registry only ever emits
// the object form, so narrow once instead of at each assertion.
function taskPermissions(agent: OpenCodeAgentConfig | undefined): OpenCodePermissionConfig["task"] {
  const permission = agent?.permission
  expect(permission).toBeObject()
  return (permission as OpenCodePermissionConfig).task
}

describe("Zen prompt profile", () => {
  const prompt = composePrompt(zen)

  test("owns a complete prompt profile without changing the six-section contract", () => {
    expect(zen.prompts.baseIdentity).toBeDefined()
    expect(zen.prompts.sharedSecurity).toBeDefined()
    expect(zen.prompts.baseTask).toBeDefined()
    expect(prompt.match(/^# (?:Base Identity|Role Identity|Shared Security|Role Security Additions|Base Task Behavior|Role Task Behavior)$/gm)).toEqual([
      "# Base Identity",
      "# Role Identity",
      "# Shared Security",
      "# Role Security Additions",
      "# Base Task Behavior",
      "# Role Task Behavior",
    ])
  })

  test("keeps source, conclusion, contradiction, and unknown separated", () => {
    expect(prompt).toContain("a source, an authority, and a freshness")
    expect(prompt).toContain("preserve the disagreement")
    expect(prompt).toContain("never manufacture consensus")
    expect(prompt).toContain("Never present an unresolved question as settled")
  })

  test("reviews against current state rather than documentation or intent", () => {
    expect(prompt).toContain("not as it is documented or remembered")
    expect(prompt).toContain("report the drift as a finding")
    expect(prompt).toContain("Distinguish a closed issue from a solved problem")
    expect(prompt).toContain("A passing suite proves only the behavior it actually covers")
  })

  test("combines the divergent and engineering postures deliberately", () => {
    expect(prompt).toContain("You combine two postures deliberately")
    expect(prompt).toContain("recommends things that cannot be built")
    expect(prompt).toContain("validates only the option that happened to be proposed")
  })

  test("routes each child agent to the question it answers", () => {
    expect(prompt).toContain("Send open exploration to the divergent research archetype")
    expect(prompt).toContain("Send feasibility and mechanism questions to the implementation archetype")
    expect(prompt).toContain("anchors to it")
  })

  test("keeps accountability and the authority ceiling with Zen", () => {
    expect(prompt).toContain("Delegation never transfers accountability")
    expect(prompt).toContain("cannot widen your authority or permission ceiling")
    expect(prompt).toContain("Recommending an action is not authority to take it")
    expect(prompt).toContain("evidence to inspect, never as a conclusion to adopt")
  })

  test("declares delegation intent toward Cortex and Flux", () => {
    const configs = createAgentConfigs(archetypeRegistry)
    expect(taskPermissions(configs.zen)).toEqual({ "*": "ask", cortex: "allow", flux: "allow" })
  })

  test("filters a disabled child out of the declared delegation map", () => {
    const configs = createAgentConfigs(archetypeRegistry, { enabled: { flux: false } })
    expect(taskPermissions(configs.zen)).toEqual({ "*": "ask", cortex: "allow" })
    expect(configs.flux).toBeUndefined()
  })

  test("stays distinct from the Cortex and Flux profiles", () => {
    expect(zen.prompts.baseIdentity).not.toBe(cortex.prompts.baseIdentity)
    expect(zen.prompts.baseIdentity).not.toBe(flux.prompts.baseIdentity)
    expect(prompt).toContain("You are Zen")
    expect(prompt).not.toContain("You are Cortex")
    expect(prompt).not.toContain("You are Flux")
    expect(prompt).not.toContain("prompt-to-artifact checklist")
    expect(prompt).not.toContain("ban the first three obvious answers")
  })

  test("passes registry validation including the portability check", () => {
    expect(() => validateRegistry()).not.toThrow()
  })
})
