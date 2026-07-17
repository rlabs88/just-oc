import { z } from "zod"

import { identifier, nonEmpty, scalar, semanticVersion, uniqueScalars } from "./common.ts"
import {
  artifactContract, delegationPolicy, prompts, provenanceSource,
  requirements, runtimePolicy, verdictContract,
} from "./contracts.ts"
import { permissionPolicy } from "./permissions.ts"

export const roleSourceSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: identifier,
  version: semanticVersion,
  displayName: scalar,
  description: scalar,
  roleClass: z.enum(["primary", "coordinator", "worker", "reviewer", "operations"]),
  enabled: z.boolean(),
  mode: z.enum(["primary", "subagent", "all"]),
  hidden: z.boolean(),
  purpose: nonEmpty,
  responsibilities: uniqueScalars.min(1),
  nonResponsibilities: uniqueScalars.min(1),
  authority: uniqueScalars.min(1),
  escalation: uniqueScalars.min(1),
  inputs: z.array(artifactContract),
  outputs: z.array(artifactContract).min(1),
  verdicts: z.array(verdictContract).min(1),
  delegation: delegationPolicy,
  permissions: permissionPolicy,
  requirements,
  runtime: runtimePolicy,
  prompts,
  provenance: provenanceSource,
}).superRefine((role, context) => {
  if (!role.hidden || role.mode === "subagent") return
  context.addIssue({ code: "custom", message: "Only subagents may be hidden" })
}).superRefine((role, context) => {
  const inputs = role.inputs.map((artifact) => artifact.name)
  const outputs = role.outputs.map((artifact) => artifact.name)
  const verdicts = role.verdicts.map((verdict) => verdict.name)
  const unique = [inputs, outputs, verdicts].every((values) => {
    return new Set(values).size === values.length
  })
  const knownEvidence = role.verdicts.every((verdict) => {
    return verdict.requiredEvidence.every((name) => outputs.includes(name))
  })
  if (unique && knownEvidence) return
  context.addIssue({ code: "custom", message: "Artifact/verdict names must be unique and evidence must name outputs" })
})

export type RoleSourceV1 = z.infer<typeof roleSourceSchema>
