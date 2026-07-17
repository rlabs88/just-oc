import type { IdentityAdapter } from "./adapter.ts"
import {
  activeControl, appendControlEvent, requireActiveControl, swapControl,
  withIdentityLease,
} from "./control-operations.ts"
import { createIdentity, migrateIdentity } from "./generation-operations.ts"
import { findRecoveryCandidate } from "./recovery.ts"
import {
  identityControlSchema, identityGenerationSchema, type IdentityGeneration,
  type IdentityInput, type MigrationInput,
} from "./schema.ts"

type Resolution = { generation: IdentityGeneration; recovered: boolean }

export class IdentityService {
  constructor(
    private readonly adapter: IdentityAdapter,
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  async create(source: IdentityInput): Promise<IdentityGeneration> {
    return createIdentity(this.adapter, this.clock, source)
  }

  async migrate(identityId: string, source: MigrationInput): Promise<IdentityGeneration> {
    return migrateIdentity(this.adapter, this.clock, identityId, source)
  }

  async resolve(identityId: string): Promise<Resolution> {
    const control = await requireActiveControl(this.adapter, identityId)
    const current = identityGenerationSchema.safeParse(
      await this.adapter.loadGeneration(identityId, control.activeGeneration),
    )
    if (current.success) return { generation: current.data, recovered: false }
    return this.recover(identityId)
  }

  async revoke(identityId: string, actor: string, reason: string): Promise<void> {
    await withIdentityLease(this.adapter, identityId, async () => {
      const current = await requireActiveControl(this.adapter, identityId)
      const next = identityControlSchema.parse({
        ...current, status: "revoked", controlVersion: current.controlVersion + 1,
        statusEpoch: current.statusEpoch + 1,
        updatedAt: this.clock(), revokedAt: this.clock(), revokedBy: actor,
        revocationReason: reason,
      })
      await swapControl(this.adapter, identityId, current.controlVersion, next)
      await appendControlEvent(this.adapter, "revoked", next, this.clock)
    })
  }

  private async recover(identityId: string): Promise<Resolution> {
    return withIdentityLease(this.adapter, identityId, async () => {
      const control = await requireActiveControl(this.adapter, identityId)
      const candidate = await findRecoveryCandidate(this.adapter, control)
      const next = activeControl(
        identityId, candidate.generation, control.controlVersion + 1, this.clock,
        control.statusEpoch,
      )
      await swapControl(this.adapter, identityId, control.controlVersion, next)
      await appendControlEvent(this.adapter, "recovered", next, this.clock)
      return { generation: candidate, recovered: true }
    })
  }
}
