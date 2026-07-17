import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { FileIdentityAdapter } from "../src/identity/file-adapter.ts"
import type { IdentityAdapter } from "../src/identity/adapter.ts"
import type {
  IdentityControl, IdentityGeneration, JournalEvent,
} from "../src/identity/schema.ts"
import { identityInputSchema } from "../src/identity/schema.ts"
import { IdentityService } from "../src/identity/service.ts"
import { deriveWorkspaceId } from "../src/identity/workspace-identity.ts"

const identityId = "just-oc.agent/cortex"
const workspaceClaim = {
  kind: "git-local-uuid" as const,
  sourceId: "22222222-2222-4222-8222-222222222222",
}
const workspaceId = deriveWorkspaceId(workspaceClaim)
const digestA = `sha256:${"a".repeat(64)}`
const digestB = `sha256:${"b".repeat(64)}`
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, {
    recursive: true,
    force: true,
  })))
})

describe("durable identity store", () => {
  test("accepts canonical domain IDs and rejects UUID surrogates", () => {
    expect(identityInputSchema.safeParse(identityInput()).success).toBe(true)
    expect(identityInputSchema.safeParse({
      ...identityInput(),
      identityId: "11111111-1111-4111-8111-111111111111",
    }).success).toBe(false)
    expect(identityInputSchema.safeParse({
      ...identityInput(),
      workspaceId: "22222222-2222-4222-8222-222222222222",
    }).success).toBe(false)
    expect(identityInputSchema.safeParse({
      ...identityInput(),
      workspaceId: `ws_${"c".repeat(64)}`,
    }).success).toBe(false)
  })

  test("persists and resumes an active identity across service instances", async () => {
    const root = await temporaryRoot()
    const service = makeService(root)
    await service.create(identityInput())

    const reloaded = makeService(root)
    const resolved = await reloaded.resolve(identityId)

    expect(resolved.generation.generation).toBe(1)
    expect(resolved.generation.roleId).toBe("cortex")
    expect(resolved.generation.updatedAt).toBe(clock())
    expect(resolved.generation.workspaceClaim).toEqual(workspaceClaim)
    expect(resolved.recovered).toBe(false)
  })

  test("retries creation after every durable write boundary", async () => {
    for (const boundary of ["generation", "control", "journal"] as const) {
      const root = await temporaryRoot()
      const adapter = new FileIdentityAdapter(root)
      const interrupted = new IdentityService(
        new InterruptingAdapter(adapter, boundary), clock,
      )

      expect(interrupted.create(identityInput())).rejects.toThrow(
        `interrupted after ${boundary}`,
      )
      const created = await new IdentityService(adapter, clock).create(identityInput())
      const events = await adapter.loadJournal(identityId)

      expect(created.generation).toBe(1)
      expect(events.filter((event) => event.type === "generation-committed"))
        .toHaveLength(1)
    }
  })

  test("retries migration after every durable write boundary", async () => {
    for (const boundary of ["generation", "control", "journal"] as const) {
      const root = await temporaryRoot()
      const adapter = new FileIdentityAdapter(root)
      await new IdentityService(adapter, clock).create(identityInput())
      const interrupted = new IdentityService(
        new InterruptingAdapter(adapter, boundary), clock,
      )
      const migration = {
        roleVersion: "2.0.0",
        roleSourceDigest: digestB,
        policyDigest: digestB,
      }

      expect(interrupted.migrate(identityId, migration)).rejects.toThrow(
        `interrupted after ${boundary}`,
      )
      const migrated = await new IdentityService(adapter, clock)
        .migrate(identityId, migration)
      const events = await adapter.loadJournal(identityId)

      expect(migrated.generation).toBe(2)
      expect(events.filter((event) => (
        event.type === "generation-committed" && event.generation === 2
      ))).toHaveLength(1)
    }
  })

  test("repairs a corrupt latest generation through lease and control CAS", async () => {
    const root = await temporaryRoot()
    const service = makeService(root)
    await service.create(identityInput())
    await service.migrate(identityId, {
      roleVersion: "2.0.0",
      roleSourceDigest: digestB,
      policyDigest: digestB,
    })
    await writeFile(generationPath(root, 2), "{corrupt", "utf8")

    const resolved = await makeService(root).resolve(identityId)
    const control = await new FileIdentityAdapter(root).loadControl(identityId)

    expect(resolved.generation.generation).toBe(1)
    expect(resolved.recovered).toBe(true)
    expect(control?.activeGeneration).toBe(1)
    expect(control?.controlVersion).toBe(3)
  })

  test("enforces identity-wide revocation after reload", async () => {
    const root = await temporaryRoot()
    const service = makeService(root)
    await service.create(identityInput())
    await service.revoke(identityId, "operator", "credential boundary changed")

    expect(makeService(root).resolve(identityId)).rejects.toThrow("not active")
  })

  test("rejects excluded persistence content without changing control", async () => {
    const root = await temporaryRoot()
    const service = makeService(root)
    await service.create(identityInput())

    expect(service.revoke(
      identityId,
      "operator",
      `never persist ghp_${"x".repeat(36)}`,
    )).rejects.toThrow("machine path, timestamp, or credential signature")
    expect(service.resolve(identityId)).resolves.toMatchObject({ recovered: false })
  })

  test("provides exclusive leases and compare-and-swap control", async () => {
    const root = await temporaryRoot()
    const adapter = new FileIdentityAdapter(root)
    const service = new IdentityService(adapter, clock)
    await service.create(identityInput())

    const release = await adapter.acquireLease(identityId, "first")
    expect(adapter.acquireLease(identityId, "second")).rejects.toThrow("lease conflict")
    await release()

    const control = await adapter.loadControl(identityId)
    expect(control).not.toBeNull()
    const changed = { ...control!, controlVersion: 2, updatedAt: clock() }
    expect(await adapter.compareAndSwapControl(identityId, 1, changed)).toBe(true)
    expect(await adapter.compareAndSwapControl(identityId, 1, changed)).toBe(false)
  })
})

function makeService(root: string): IdentityService {
  return new IdentityService(new FileIdentityAdapter(root), clock)
}

function identityInput() {
  return {
    identityId,
    workspaceId,
    workspaceClaim,
    roleId: "cortex",
    roleVersion: "1.0.0",
    roleSourceDigest: digestA,
    policyDigest: digestA,
  }
}

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "rt-234-identity-"))
  roots.push(root)
  return root
}

function generationPath(root: string, generation: number): string {
  return join(root, "identities", identityId, "generations", `${generation}.json`)
}

function clock(): string {
  return "2026-07-17T05:00:00.000Z"
}

type WriteBoundary = "generation" | "control" | "journal"

class InterruptingAdapter implements IdentityAdapter {
  private interrupted = false

  constructor(
    private readonly inner: IdentityAdapter,
    private readonly boundary: WriteBoundary,
  ) {}

  loadControl(identity: string): Promise<IdentityControl | null> {
    return this.inner.loadControl(identity)
  }

  async compareAndSwapControl(
    identity: string,
    expectedVersion: number | null,
    next: IdentityControl,
  ): Promise<boolean> {
    const swapped = await this.inner.compareAndSwapControl(
      identity, expectedVersion, next,
    )
    if (swapped) this.interrupt("control")
    return swapped
  }

  async writeGeneration(record: IdentityGeneration): Promise<void> {
    await this.inner.writeGeneration(record)
    this.interrupt("generation")
  }

  loadGeneration(identity: string, generation: number): Promise<unknown | null> {
    return this.inner.loadGeneration(identity, generation)
  }

  listGenerations(identity: string): Promise<number[]> {
    return this.inner.listGenerations(identity)
  }

  async appendJournal(event: JournalEvent): Promise<void> {
    await this.inner.appendJournal(event)
    this.interrupt("journal")
  }

  loadJournal(identity: string): Promise<JournalEvent[]> {
    return this.inner.loadJournal(identity)
  }

  acquireLease(identity: string, token: string): Promise<() => Promise<void>> {
    return this.inner.acquireLease(identity, token)
  }

  private interrupt(boundary: WriteBoundary): void {
    if (this.boundary !== boundary || this.interrupted) return
    this.interrupted = true
    throw new Error(`interrupted after ${boundary}`)
  }
}
