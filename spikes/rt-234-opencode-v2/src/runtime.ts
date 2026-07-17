import type { ParsedCompilerInputV1 } from "./schema/compiler-input.ts"

export type RuntimeBinding = {
  model: string
  variant?: string
  temperature: number
  steps: number
}

export function resolveRuntime(input: ParsedCompilerInputV1): RuntimeBinding {
  const runtime = input.role.runtime
  const variant = last(input, "variant") ?? runtime.defaultVariant
  return {
    model: last(input, "model") ?? runtime.defaultModel,
    ...(variant === undefined ? {} : { variant }),
    temperature: last(input, "temperature") ?? runtime.temperature.default,
    steps: last(input, "steps") ?? runtime.steps.default,
  }
}

function last<K extends "model" | "variant" | "temperature" | "steps">(
  input: ParsedCompilerInputV1,
  key: K,
): ParsedCompilerInputV1["overlays"][number][K] {
  return [...input.overlays].reverse().find((overlay) => {
    return overlay[key] !== undefined
  })?.[key]
}
