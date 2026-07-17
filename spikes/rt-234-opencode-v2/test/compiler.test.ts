import { describe, expect, test } from "bun:test"

import { compileRole } from "../src/compiler.ts"
import { roleSourceSchema } from "../src/role-schema.ts"
import { compilerInput, representativeRoles } from "./fixtures.ts"

describe("role contract", () => {
  test("accepts all five representative role classes", () => {
    const classes = representativeRoles.map((role) => {
      return roleSourceSchema.parse(role).roleClass
    })

    expect(classes).toEqual([
      "primary",
      "coordinator",
      "worker",
      "reviewer",
      "operations",
    ])
  })

  test("rejects unknown source fields", () => {
    const invalid = { ...representativeRoles[0], localOnly: true }
    expect(roleSourceSchema.safeParse(invalid).success).toBe(false)
  })

  test("produces deterministic golden outputs", () => {
    const outputs = representativeRoles.map((role) => {
      return compileRole({ ...compilerInput, role })
    })

    expect(outputs).toMatchSnapshot()
  })

  test("applies narrowing overlays without widening a deny", () => {
    const role = representativeRoles[0]!
    const output = compileRole({
      ...compilerInput,
      role,
      overlays: [{ layer: "project", permissions: { bash: "deny" } }],
    })

    const permissions = output.agentConfig.permission as Record<string, unknown>
    expect(Object.values(permissions.bash ?? {})).toEqual([
      "deny",
      "deny",
    ])
  })

  test("binds hooks outside AgentConfig and includes them in bindingDigest", () => {
    const role = representativeRoles[0]!
    const first = compileRole({ ...compilerInput, role })
    const changed = {
      ...role,
      requirements: { ...role.requirements, hooks: ["audit", "checkpoint"] },
    }
    const second = compileRole({
      ...compilerInput,
      role: changed,
      registry: {
        ...compilerInput.registry,
        roles: compilerInput.registry.roles.map((candidate) => {
          return candidate.id === changed.id ? changed : candidate
        }),
      },
    })

    expect(first.agentConfig).not.toHaveProperty("hooks")
    expect(first.provenance.bindingDigest).not.toBe(
      second.provenance.bindingDigest,
    )
  })
})
