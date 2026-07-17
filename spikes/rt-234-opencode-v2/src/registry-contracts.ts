import type { ParsedCompilerInputV1 } from "./schema/compiler-input.ts"
import { patternedKeys, scalarKeys } from "./schema/permissions.ts"

const reserved = new Set(["*", "task", ...patternedKeys, ...scalarKeys])

export function validateAgentIds(input: ParsedCompilerInputV1): void {
  const collision = input.registry.roles.find((role) => {
    return input.registry.occupiedAgentIds.includes(role.id)
  })
  if (collision) fail(`Role uses an occupied OpenCode agent ID: ${collision.id}`)
}

export function validateToolIds(input: ParsedCompilerInputV1): void {
  for (const role of input.registry.roles) {
    const collision = role.permissions.customTools.find((tool) => reserved.has(tool.toolId))
    if (collision) fail(`Custom tool uses a reserved permission key: ${collision.toolId}`)
  }
}

export function validateVerdicts(input: ParsedCompilerInputV1): void {
  const effects = new Map<string, string>()
  for (const role of input.registry.roles) {
    for (const verdict of role.verdicts) {
      const known = effects.get(verdict.name)
      if (known && known !== verdict.gateEffect) {
        fail(`Conflicting verdict gate effect: ${verdict.name}`)
      }
      effects.set(verdict.name, verdict.gateEffect)
    }
  }
}

function fail(message: string): never {
  throw new Error(message)
}
