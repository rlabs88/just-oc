import type { IdentityAdapter } from "./adapter.ts"
import { activeControl, requireActiveControl, swapControl, withIdentityLease } from "./control-operations.ts"
import {
  identityGenerationSchema, identityInputSchema, migrationInputSchema,
  type IdentityGeneration, type IdentityInput, type MigrationInput,
} from "./schema.ts"
import {
  ensureCommittedEvent, ensureGeneration, matchesIdentityInput,
  matchesMigrationInput,
} from "./transactions.ts"

export async function createIdentity(
  adapter: IdentityAdapter,
  clock: () => string,
  source: IdentityInput,
): Promise<IdentityGeneration> {
  const input = identityInputSchema.parse(source)
  return withIdentityLease(adapter, input.identityId, async () => {
    const control = await adapter.loadControl(input.identityId)
    if (control) {
      if (control.status !== "active") throw new Error("Identity already exists")
      const existing = identityGenerationSchema.parse(
        await adapter.loadGeneration(input.identityId, control.activeGeneration),
      )
      if (existing.generation !== 1 || !matchesIdentityInput(existing, input)) {
        throw new Error("Identity already exists")
      }
      await ensureCommittedEvent(adapter, control, clock)
      return existing
    }
    const now = clock()
    const generation = identityGenerationSchema.parse({
      ...input, identitySchemaVersion: 1, generation: 1,
      createdAt: now, updatedAt: now,
    })
    const next = activeControl(input.identityId, 1, 1, clock)
    const persisted = await ensureGeneration(adapter, generation)
    if (!await adapter.compareAndSwapControl(input.identityId, null, next)) {
      throw new Error("Identity control conflict")
    }
    await ensureCommittedEvent(adapter, next, clock)
    return persisted
  })
}

export async function migrateIdentity(
  adapter: IdentityAdapter,
  clock: () => string,
  identityId: string,
  source: MigrationInput,
): Promise<IdentityGeneration> {
  const input = migrationInputSchema.parse(source)
  return withIdentityLease(adapter, identityId, async () => {
    const control = await requireActiveControl(adapter, identityId)
    const current = identityGenerationSchema.parse(
      await adapter.loadGeneration(identityId, control.activeGeneration),
    )
    if (matchesMigrationInput(current, input)) {
      await ensureCommittedEvent(adapter, control, clock)
      return current
    }
    const now = clock()
    const generation = identityGenerationSchema.parse({
      ...current, ...input, generation: current.generation + 1,
      createdAt: now, updatedAt: now, migratedFrom: current.generation,
    })
    const next = activeControl(
      identityId, generation.generation, control.controlVersion + 1,
      clock, control.statusEpoch,
    )
    const persisted = await ensureGeneration(adapter, generation)
    await swapControl(adapter, identityId, control.controlVersion, next)
    await ensureCommittedEvent(adapter, next, clock)
    return persisted
  })
}
