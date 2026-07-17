import { join } from "node:path"

import { assertPersistable, type IdentityAdapter } from "./adapter.ts"
import {
  appendJsonLine, createLock, listNames, readJson, readJsonLines, writeJsonAtomic,
} from "./file-io.ts"
import {
  identityControlSchema, journalEventSchema,
  type IdentityControl, type IdentityGeneration, type JournalEvent,
} from "./schema.ts"

export class FileIdentityAdapter implements IdentityAdapter {
  constructor(private readonly root: string) {}

  async loadControl(identityId: string): Promise<IdentityControl | null> {
    const value = await readJson(this.path(identityId, "control.json"))
    return value === null ? null : identityControlSchema.parse(value)
  }

  async compareAndSwapControl(
    identityId: string,
    expectedVersion: number | null,
    next: IdentityControl,
  ): Promise<boolean> {
    const current = await this.loadControl(identityId)
    if ((current?.controlVersion ?? null) !== expectedVersion) return false
    assertPersistable(next)
    await writeJsonAtomic(this.path(identityId, "control.json"), next)
    return true
  }

  async writeGeneration(record: IdentityGeneration): Promise<void> {
    assertPersistable(record)
    const path = this.generationPath(record.identityId, record.generation)
    if (await readJson(path) !== null) throw new Error("Generation already exists")
    await writeJsonAtomic(path, record)
  }

  async loadGeneration(identityId: string, generation: number): Promise<unknown | null> {
    try {
      return await readJson(this.generationPath(identityId, generation))
    } catch (error) {
      if (error instanceof SyntaxError) return { corrupt: true }
      throw error
    }
  }

  async listGenerations(identityId: string): Promise<number[]> {
    const names = await listNames(this.path(identityId, "generations"))
    return names.flatMap((name) => {
      const match = /^(\d+)\.json$/.exec(name)
      return match ? [Number(match[1])] : []
    }).sort((left, right) => right - left)
  }

  async appendJournal(event: JournalEvent): Promise<void> {
    const parsed = journalEventSchema.parse(event)
    assertPersistable(parsed)
    await appendJsonLine(this.path(event.identityId, "journal.jsonl"), parsed)
  }

  async loadJournal(identityId: string): Promise<JournalEvent[]> {
    const values = await readJsonLines(this.path(identityId, "journal.jsonl"))
    return values.map((value) => journalEventSchema.parse(value))
  }

  acquireLease(identityId: string, token: string): Promise<() => Promise<void>> {
    return createLock(this.path(identityId, "lease"), token)
  }

  private path(identityId: string, suffix: string): string {
    return join(this.root, "identities", identityId, suffix)
  }

  private generationPath(identityId: string, generation: number): string {
    return this.path(identityId, join("generations", `${generation}.json`))
  }
}
