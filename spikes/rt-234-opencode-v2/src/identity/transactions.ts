import { canonicalJson } from "../canonical.ts"
import type { IdentityAdapter } from "./adapter.ts"
import type {
  IdentityControl, IdentityGeneration, IdentityInput, MigrationInput,
} from "./schema.ts"
import { identityGenerationSchema } from "./schema.ts"

export async function ensureGeneration(
  adapter: IdentityAdapter,
  intended: IdentityGeneration,
): Promise<IdentityGeneration> {
  const stored = await adapter.loadGeneration(
    intended.identityId, intended.generation,
  )
  if (stored === null) {
    await adapter.writeGeneration(intended)
    return intended
  }
  const parsed = identityGenerationSchema.parse(stored)
  if (generationIntent(parsed) !== generationIntent(intended)) {
    throw new Error("Generation intent conflict")
  }
  return parsed
}

export async function ensureCommittedEvent(
  adapter: IdentityAdapter,
  control: IdentityControl,
  clock: () => string,
): Promise<void> {
  const exists = (await adapter.loadJournal(control.identityId)).some((event) => (
    event.type === "generation-committed"
    && event.generation === control.activeGeneration
    && event.controlVersion === control.controlVersion
  ))
  if (exists) return
  await adapter.appendJournal({
    type: "generation-committed",
    identityId: control.identityId,
    generation: control.activeGeneration,
    controlVersion: control.controlVersion,
    timestamp: clock(),
  })
}

export function matchesIdentityInput(
  generation: IdentityGeneration,
  input: IdentityInput,
): boolean {
  return canonicalJson({
    identityId: generation.identityId,
    workspaceId: generation.workspaceId,
    workspaceClaim: generation.workspaceClaim,
    roleId: generation.roleId,
    roleVersion: generation.roleVersion,
    roleSourceDigest: generation.roleSourceDigest,
    policyDigest: generation.policyDigest,
  }) === canonicalJson(input)
}

export function matchesMigrationInput(
  generation: IdentityGeneration,
  input: MigrationInput,
): boolean {
  return generation.roleVersion === input.roleVersion
    && generation.roleSourceDigest === input.roleSourceDigest
    && generation.policyDigest === input.policyDigest
}

function generationIntent(generation: IdentityGeneration): string {
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...intent } = generation
  return canonicalJson(intent)
}
