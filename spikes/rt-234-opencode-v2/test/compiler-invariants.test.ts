import { describe, expect, test } from "bun:test"

import { compileRole } from "../src/compiler.ts"
import { compilerInputSchema, roleSourceSchema } from "../src/role-schema.ts"
import { compilerInput, representativeRoles } from "./fixtures.ts"

const cortex = representativeRoles[0]!

describe("compiler invariants", () => {
  test("renders the semantic fields in the exact top-level section order", () => {
    const prompt = compileRole({ ...compilerInput, role: cortex }).agentConfig.prompt!
    const headings = prompt.split("\n").filter((line) => /^# /.test(line))

    expect(headings).toEqual([
      "# Identity Baseline",
      "# Role Identity",
      "# Security Baseline",
      "# Role Security Additions",
      "# Task Baseline",
      "# Role Task Contract",
    ])
    expect(prompt).toContain("## Responsibilities")
    expect(prompt).toContain("## Outputs")
    expect(prompt).toContain("## Verdicts")
    expect(prompt).toContain("## Delegation")
    expect(prompt).toContain("## Runtime requirements")
  })

  test("derives task permission from the delegation contract", () => {
    const output = compileRole({ ...compilerInput, role: cortex })
    const permission = output.agentConfig.permission as Record<string, unknown>

    expect(permission.task).toEqual({
      "*": "deny",
      "focused-builder": "allow",
    })
  })

  test("rejects unordered, duplicated, or pattern-valued overlays", () => {
    const unordered = {
      ...compilerInput,
      overlays: [
        { layer: "project" as const },
        { layer: "repository" as const },
      ],
    }
    expect(() => compileRole(unordered)).toThrow("ordered host-to-session")

    const granular = {
      ...compilerInput,
      overlays: [{ layer: "host", permissions: { bash: { "*": "deny" } } }],
    }
    expect(compilerInputSchema.safeParse(granular).success).toBe(false)
  })

  test("rejects delegation cycles and inconsistent registry sources", () => {
    const roles = structuredClone(representativeRoles)
    roles[2]!.delegation = {
      maxDepth: 1,
      maxConcurrency: 1,
      targets: [{
        roleId: "cortex",
        invocation: "allow",
        inputArtifacts: ["task-brief"],
        returnArtifacts: ["cortex-handoff"],
      }],
    }
    expect(() => compileRole({
      ...compilerInput,
      role: cortex,
      registry: { ...compilerInput.registry, roles },
    })).toThrow("Delegation cycle")

    const stale = structuredClone(representativeRoles)
    stale[0]!.description = "Stale registry source."
    expect(() => compileRole({
      ...compilerInput,
      role: cortex,
      registry: { ...compilerInput.registry, roles: stale },
    })).toThrow("registry source is stale")
  })

  test("rejects invalid nested defaults and exact-pin drift", () => {
    const invalidRole = {
      ...cortex,
      runtime: { ...cortex.runtime, defaultModel: "unknown/model" },
    }
    expect(roleSourceSchema.safeParse(invalidRole).success).toBe(false)

    const drift = {
      ...compilerInput,
      pins: { ...compilerInput.pins, opencodeVersion: "1.17.6" },
    }
    expect(compilerInputSchema.safeParse(drift).success).toBe(false)
  })

  test("produces all Phase 1 digests without leaking binding metadata", () => {
    const output = compileRole({ ...compilerInput, role: cortex })
    const digests = [
      output.provenance.roleSourceDigest,
      output.provenance.policyDigest,
      output.provenance.overlayDigest,
      output.provenance.bindingDigest,
      output.provenance.outputDigest,
    ]

    expect(digests.every((digest) => /^sha256:[a-f0-9]{64}$/.test(digest))).toBe(true)
    expect(output.agentConfig).not.toHaveProperty("plugins")
    expect(output.agentConfig).not.toHaveProperty("skills")
  })
})
