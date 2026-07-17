import type { IdentityAdapter } from "./adapter.ts"
import {
  identityGenerationSchema, type IdentityControl, type IdentityGeneration,
} from "./schema.ts"

export async function findRecoveryCandidate(
  adapter: IdentityAdapter,
  control: IdentityControl,
): Promise<IdentityGeneration> {
  const committed = new Set((await adapter.loadJournal(control.identityId))
    .filter((event) => event.type === "generation-committed")
    .map((event) => event.generation))
  const generations = await adapter.listGenerations(control.identityId)
  for (const number of generations) {
    if (number > control.activeGeneration || !committed.has(number)) continue
    const candidate = identityGenerationSchema.safeParse(
      await adapter.loadGeneration(control.identityId, number),
    )
    if (candidate.success) return candidate.data
  }
  throw new Error("No journal-confirmed valid generation")
}
