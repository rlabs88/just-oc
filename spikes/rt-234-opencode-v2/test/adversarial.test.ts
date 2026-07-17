import { describe, expect, test } from "bun:test"

import { compileRole } from "../src/compiler.ts"
import {
  compiledRoleSchema, compilerInputSchema, roleSourceSchema,
  type CompilerInputV1, type RoleSourceV1,
} from "../src/role-schema.ts"
import { compilerInput, representativeRoles } from "./fixtures.ts"

const cortex = representativeRoles[0]!

describe("adversarial contract probes", () => {
  test("rejects custom tools that collide with permission keys", () => {
    const role = withCustomTool(cortex, "read")
    expect(() => compileRole(inputFor(role))).toThrow("reserved permission key")
  })

  test("accepts a registry-backed custom tool without AgentConfig leakage", () => {
    const role = withCustomTool(cortex, "mcp_search")
    const output = compileRole(inputFor(role))
    const permission = output.agentConfig.permission as Record<string, unknown>

    expect(permission.mcp_search).toBe("ask")
    expect(output.agentConfig).not.toHaveProperty("plugins")
  })

  test("orders custom tools by locale-independent code units", () => {
    const role = withCustomTools(cortex, ["a_tool", "Z_tool"])
    const input = inputFor(role)
    input.registry.customToolIds = ["a_tool", "Z_tool"]
    const output = compileRole(input)
    const permission = output.agentConfig.permission as Record<string, unknown>

    expect(Object.keys(permission).slice(-2)).toEqual(["Z_tool", "a_tool"])
  })

  test("rejects unknown registry edges and occupied agent IDs", () => {
    const coordinator = structuredClone(representativeRoles[1]!)
    coordinator.delegation.targets[0]!.roleId = "missing-role"
    expect(() => compileRole(inputFor(cortex, [
      cortex, coordinator, ...representativeRoles.slice(2),
    ]))).toThrow("Unknown registry delegation target")

    const build = { ...cortex, id: "build", displayName: "build" }
    expect(() => compileRole(inputFor(build, [
      build, ...representativeRoles.slice(1),
    ]))).toThrow("occupied OpenCode agent ID")
  })

  test("rejects absolute paths, timestamps, and credential signatures", () => {
    const invalid = {
      ...cortex,
      prompts: {
        ...cortex.prompts,
        taskAdditions: "Read /Users/alice/key at 2026-07-17T04:00:00Z sk-abcdefghijklmnop",
      },
      provenance: { ...cortex.provenance, source: "/Users/alice/role.ts" },
    }
    expect(roleSourceSchema.safeParse(invalid).success).toBe(false)

    const genericPath = {
      ...cortex,
      prompts: {
        ...cortex.prompts,
        taskAdditions: "Read /opt/workspace/config before dispatch.",
      },
    }
    expect(roleSourceSchema.safeParse(genericPath).success).toBe(false)

    const syntheticGithubToken = {
      ...cortex,
      prompts: {
        ...cortex.prompts,
        taskAdditions: `Never retain ghp_${"x".repeat(36)} in a role.`,
      },
    }
    expect(roleSourceSchema.safeParse(syntheticGithubToken).success).toBe(false)

    for (const taskAdditions of [
      "Read C:/Users/example/config.json.",
      "Read ~/example/config.json.",
      "Path:/opt/example/config.json",
      "Generated 2026-07-17 04:00:00Z.",
    ]) {
      const portable = {
        ...cortex,
        prompts: { ...cortex.prompts, taskAdditions },
      }
      expect(roleSourceSchema.safeParse(portable).success).toBe(false)
    }

    const documentedUrl = {
      ...cortex,
      prompts: {
        ...cortex.prompts,
        taskAdditions: "See https://opencode.ai/docs/permissions/ and docs/policy.md.",
      },
    }
    expect(roleSourceSchema.safeParse(documentedUrl).success).toBe(true)
  })

  test("requires named delegation inputs accepted by the target", () => {
    const empty = structuredClone(cortex)
    empty.delegation.targets[0]!.inputArtifacts = []
    expect(roleSourceSchema.safeParse(empty).success).toBe(false)

    const worker = structuredClone(representativeRoles[2]!)
    worker.inputs = []
    expect(() => compileRole(inputFor(cortex, [
      cortex, representativeRoles[1]!, worker, ...representativeRoles.slice(3),
    ]))).toThrow("Unknown target input artifact")

    const noReturn = structuredClone(cortex)
    noReturn.delegation.targets[0]!.returnArtifacts = []
    expect(roleSourceSchema.safeParse(noReturn).success).toBe(false)
  })

  test("rejects cross-role verdict names with conflicting gate effects", () => {
    const worker = structuredClone(representativeRoles[2]!)
    worker.verdicts[0]!.gateEffect = "block"

    expect(() => compileRole(inputFor(cortex, [
      cortex, representativeRoles[1]!, worker, ...representativeRoles.slice(3),
    ]))).toThrow("Conflicting verdict gate effect")
  })

  test("adapts shorthand host policy and rejects granular host policy", () => {
    const narrowed = compileRole({ ...inputFor(cortex), hostPermission: "ask" })
    const permission = narrowed.agentConfig.permission as Record<string, unknown>
    expect(permission.read).toEqual({ "*": "ask", "*.env*": "deny" })

    const granular = {
      ...inputFor(cortex),
      hostPermission: { bash: { "*": "deny" } },
    } as CompilerInputV1
    expect(() => compileRole(granular)).toThrow("Granular host permission")
  })

  test("runtime-validates the complete compiler output", () => {
    const output = compileRole(inputFor(cortex))
    expect(compiledRoleSchema.safeParse(output).success).toBe(true)
    expect(compiledRoleSchema.safeParse({ ...output, rogue: true }).success).toBe(false)
  })
})

function inputFor(
  role: RoleSourceV1,
  roles: readonly RoleSourceV1[] = representativeRoles,
): CompilerInputV1 {
  const sources = roles.map((candidate) => {
    return candidate.id === role.id ? role : candidate
  })
  return {
    ...compilerInput,
    role,
    registry: {
      ...compilerInput.registry,
      roles: sources,
      pluginIds: ["search-plugin"],
      skillIds: ["search-skill"],
      customToolIds: ["mcp_search", "read"],
    },
  }
}

function withCustomTool(role: RoleSourceV1, toolId: string): RoleSourceV1 {
  return withCustomTools(role, [toolId])
}

function withCustomTools(role: RoleSourceV1, toolIds: string[]): RoleSourceV1 {
  return {
    ...role,
    permissions: {
      ...role.permissions,
      customTools: toolIds.map((toolId) => ({ toolId, action: "ask" as const })),
    },
    requirements: {
      ...role.requirements,
      plugins: ["search-plugin"],
      skills: ["search-skill"],
    },
  }
}
