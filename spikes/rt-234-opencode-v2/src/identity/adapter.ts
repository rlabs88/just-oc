import type {
  IdentityControl, IdentityGeneration, JournalEvent,
} from "./schema.ts"
import { isPersistenceSafeText } from "../schema/content-safety.ts"

export interface IdentityAdapter {
  loadControl(identityId: string): Promise<IdentityControl | null>
  compareAndSwapControl(
    identityId: string,
    expectedVersion: number | null,
    next: IdentityControl,
  ): Promise<boolean>
  writeGeneration(record: IdentityGeneration): Promise<void>
  loadGeneration(identityId: string, generation: number): Promise<unknown | null>
  listGenerations(identityId: string): Promise<number[]>
  appendJournal(event: JournalEvent): Promise<void>
  loadJournal(identityId: string): Promise<JournalEvent[]>
  acquireLease(identityId: string, token: string): Promise<() => Promise<void>>
}

const forbiddenKey = /(?:api.?key|access.?token|refresh.?token|cookie|prompt|transcript|reasoning|tool.?output|todos?|environment)/i
export function assertPersistable(value: unknown, key = "root"): void {
  if (forbiddenKey.test(key)) throw new Error(`Persistence excludes field: ${key}`)
  if (typeof value === "string" && !isPersistenceSafeText(value)) {
    throw new Error(`Persistence excludes unsafe content in: ${key}`)
  }
  if (Array.isArray(value)) {
    value.forEach((item) => assertPersistable(item, key))
    return
  }
  if (!value || typeof value !== "object") return
  for (const [childKey, child] of Object.entries(value)) {
    assertPersistable(child, childKey)
  }
}
