import type { IdentityAdapter } from "./adapter.ts"
import {
  identityControlSchema, type IdentityControl,
} from "./schema.ts"

export function activeControl(
  identityId: string,
  generation: number,
  version: number,
  clock: () => string,
  statusEpoch = 1,
): IdentityControl {
  return identityControlSchema.parse({
    schemaVersion: 1,
    identityId,
    status: "active",
    statusEpoch,
    activeGeneration: generation,
    controlVersion: version,
    updatedAt: clock(),
  })
}

export function appendControlEvent(
  adapter: IdentityAdapter,
  type: "generation-committed" | "recovered" | "revoked",
  control: IdentityControl,
  clock: () => string,
): Promise<void> {
  return adapter.appendJournal({
    type,
    identityId: control.identityId,
    generation: control.activeGeneration,
    controlVersion: control.controlVersion,
    timestamp: clock(),
  })
}

export async function requireActiveControl(
  adapter: IdentityAdapter,
  identityId: string,
): Promise<IdentityControl> {
  const control = await adapter.loadControl(identityId)
  if (!control) throw new Error("Identity does not exist")
  if (control.status !== "active") throw new Error("Identity is not active")
  return control
}

export async function swapControl(
  adapter: IdentityAdapter,
  identityId: string,
  expectedVersion: number,
  next: IdentityControl,
): Promise<void> {
  if (!await adapter.compareAndSwapControl(identityId, expectedVersion, next)) {
    throw new Error("Identity control conflict")
  }
}

export async function withIdentityLease<T>(
  adapter: IdentityAdapter,
  identityId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const release = await adapter.acquireLease(identityId, crypto.randomUUID())
  try { return await operation() } finally { await release() }
}
