import { validateRegistry } from "./registry-validation.ts"
import { resolveRuntime } from "./runtime.ts"
import type { ParsedCompilerInputV1 } from "./schema/compiler-input.ts"

const layerOrder = ["organization", "repository", "project", "session"]

export function validateCompilerInput(input: ParsedCompilerInputV1): void {
  validateOverlayOrder(input)
  validateRuntime(input)
  validateRegistry(input)
}

function validateOverlayOrder(input: ParsedCompilerInputV1): void {
  const indexes = input.overlays.map((overlay) => layerOrder.indexOf(overlay.layer))
  const ordered = indexes.every((value, index) => index === 0 || value > indexes[index - 1]!)
  if (!ordered) throw new Error("Overlays must be unique and ordered host-to-session")
}

function validateRuntime(input: ParsedCompilerInputV1): void {
  const selected = resolveRuntime(input)
  const allowed = input.role.runtime
  if (!allowed.allowedModels.includes(selected.model)) fail("Model is outside the role allowlist")
  if (selected.variant && !allowed.allowedVariants.includes(selected.variant)) fail("Variant is outside the role allowlist")
  if (selected.temperature < allowed.temperature.minimum) fail("Temperature is below the role minimum")
  if (selected.temperature > allowed.temperature.maximum) fail("Temperature is above the role maximum")
  if (selected.steps > allowed.steps.maximum) fail("Steps exceed the role maximum")
}

function fail(message: string): never {
  throw new Error(message)
}
