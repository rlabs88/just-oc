import { describe, expect, test } from "bun:test"

import { sharedPrompts } from "../src/shared-prompts/index.ts"
import { compileRole } from "../src/compiler.ts"
import { compilerInput } from "./fixtures.ts"

describe("shared base prompts", () => {
  test("provide detailed identity, security, and task contracts", () => {
    expect(sharedPrompts.identity.length).toBeGreaterThan(2_000)
    expect(sharedPrompts.security.length).toBeGreaterThan(2_000)
    expect(sharedPrompts.task.length).toBeGreaterThan(3_000)
  })

  test("cover the durable harness boundaries", () => {
    const combined = Object.values(sharedPrompts).join("\n")

    for (const phrase of [
      "instruction precedence",
      "permission",
      "untrusted input",
      "secrets",
      "destructive",
      "shared state",
      "verification",
      "delegation",
      "final response",
    ]) {
      expect(combined.toLowerCase()).toContain(phrase)
    }
  })

  test("compile as deterministic portable prompt inputs", () => {
    const output = compileRole({ ...compilerInput, sharedPrompts })

    expect(output.agentConfig.prompt).toContain("## Tool discipline")
    expect(output.agentConfig.prompt).toContain("## Verification and handoff")
    expect(output.provenance.sharedPromptDigests.identity).toMatch(
      /^sha256:[a-f0-9]{64}$/,
    )
  })
})
