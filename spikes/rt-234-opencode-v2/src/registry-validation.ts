import { canonicalJson } from "./canonical.ts"
import {
  validateAgentIds, validateToolIds, validateVerdicts,
} from "./registry-contracts.ts"
import type { ParsedCompilerInputV1 } from "./schema/compiler-input.ts"

export function validateRegistry(input: ParsedCompilerInputV1): void {
  validateCapabilities(input)
  validateCurrentRole(input)
  validateAgentIds(input)
  validateToolIds(input)
  validateVerdicts(input)
  validateDelegation(input)
  validateCycles(input)
}

function validateCapabilities(input: ParsedCompilerInputV1): void {
  for (const role of input.registry.roles) {
    const tools = role.permissions.customTools.map((tool) => tool.toolId)
    const checks = [
      [role.runtime.allowedModels, input.registry.modelIds, "model"],
      [role.requirements.plugins, input.registry.pluginIds, "plugin"],
      [role.requirements.hooks, input.registry.hookIds, "hook"],
      [role.requirements.skills, input.registry.skillIds, "skill"],
      [tools, input.registry.customToolIds, "custom tool"],
    ] as const
    for (const [selected, available, label] of checks) {
      const missing = selected.find((value) => !available.includes(value))
      if (missing) fail(`Unknown ${label}: ${missing}`)
    }
  }
}

function validateCurrentRole(input: ParsedCompilerInputV1): void {
  const indexed = input.registry.roles.find((role) => role.id === input.role.id)
  if (!indexed) fail(`Role is absent from registry: ${input.role.id}`)
  if (canonicalJson(indexed) !== canonicalJson(input.role)) {
    fail("Role registry source is stale")
  }
}

function validateDelegation(input: ParsedCompilerInputV1): void {
  for (const role of input.registry.roles) {
    for (const target of role.delegation.targets) validateTarget(input, target)
  }
}

function validateTarget(
  input: ParsedCompilerInputV1,
  target: ParsedCompilerInputV1["role"]["delegation"]["targets"][number],
): void {
  const indexed = input.registry.roles.find((role) => role.id === target.roleId)
  if (!indexed) fail(`Unknown registry delegation target: ${target.roleId}`)
  if (!indexed.enabled) fail(`Delegation target is disabled: ${target.roleId}`)
  const inputs = indexed.inputs.map((artifact) => artifact.name)
  const outputs = indexed.outputs.map((artifact) => artifact.name)
  const missingInput = target.inputArtifacts.find((name) => !inputs.includes(name))
  if (missingInput) fail(`Unknown target input artifact: ${missingInput}`)
  const missingOutput = target.returnArtifacts.find((name) => !outputs.includes(name))
  if (missingOutput) fail(`Unknown return artifact: ${missingOutput}`)
}

function validateCycles(input: ParsedCompilerInputV1): void {
  const graph = new Map(input.registry.roles.map((role) => [
    role.id,
    role.delegation.targets.map((target) => target.roleId),
  ]))
  const visited = new Set<string>()
  const active = new Set<string>()
  const visit = (id: string): void => {
    if (active.has(id)) fail(`Delegation cycle includes: ${id}`)
    if (visited.has(id)) return
    active.add(id)
    for (const target of graph.get(id) ?? []) visit(target)
    active.delete(id)
    visited.add(id)
  }
  for (const id of graph.keys()) visit(id)
}

function fail(message: string): never {
  throw new Error(message)
}
