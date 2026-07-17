import { z } from "zod"

import {
  decisionReference, identifier, nonEmpty, relativeLocator, scalar, uniqueScalars,
} from "./common.ts"

const artifactField = z.strictObject({
  name: identifier,
  valueType: z.enum(["string", "number", "boolean", "json"]),
  required: z.boolean(),
  description: scalar,
})

export const artifactContract = z.strictObject({
  name: identifier,
  purpose: scalar,
  mediaType: z.string().regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/),
  absence: z.enum(["blocks", "allows-partial"]),
  fields: z.array(artifactField).min(1),
}).superRefine((value, context) => {
  const names = value.fields.map((field) => field.name)
  if (new Set(names).size === names.length) return
  context.addIssue({ code: "custom", message: "Artifact field names must be unique" })
})

export const verdictContract = z.strictObject({
  name: identifier,
  meaning: scalar,
  gateEffect: z.enum(["pass", "block", "continue-with-warning"]),
  requiredEvidence: uniqueScalars,
})

const delegationTarget = z.strictObject({
  roleId: identifier,
  invocation: z.enum(["allow", "ask"]),
  inputArtifacts: uniqueScalars.min(1),
  returnArtifacts: uniqueScalars.min(1),
})

export const delegationPolicy = z.strictObject({
  maxDepth: z.number().int().min(0).max(8),
  maxConcurrency: z.number().int().min(0).max(16),
  targets: z.array(delegationTarget),
}).superRefine((value, context) => {
  const noTargets = value.targets.length === 0
  const disabled = value.maxDepth === 0 && value.maxConcurrency === 0
  if (noTargets === disabled) return
  context.addIssue({ code: "custom", message: "Delegation bounds and targets disagree" })
}).superRefine((value, context) => {
  const ids = value.targets.map((target) => target.roleId)
  if (new Set(ids).size === ids.length) return
  context.addIssue({ code: "custom", message: "Delegation targets must be unique" })
})

export const requirements = z.strictObject({
  skills: uniqueScalars,
  plugins: uniqueScalars,
  hooks: uniqueScalars,
})

export const runtimePolicy = z.strictObject({
  allowedModels: uniqueScalars.min(1),
  defaultModel: scalar,
  allowedVariants: uniqueScalars,
  defaultVariant: scalar.optional(),
  temperature: z.strictObject({
    minimum: z.number().finite().min(0).max(2),
    maximum: z.number().finite().min(0).max(2),
    default: z.number().finite().min(0).max(2),
  }),
  steps: z.strictObject({
    maximum: z.number().int().positive(),
    default: z.number().int().positive(),
  }),
}).superRefine((value, context) => {
  const validModel = value.allowedModels.includes(value.defaultModel)
  const validVariant = !value.defaultVariant || value.allowedVariants.includes(value.defaultVariant)
  const validTemperature = value.temperature.minimum <= value.temperature.default
    && value.temperature.default <= value.temperature.maximum
  const validSteps = value.steps.default <= value.steps.maximum
  if (validModel && validVariant && validTemperature && validSteps) return
  context.addIssue({ code: "custom", message: "Runtime defaults must satisfy their allowlists and bounds" })
})

export const prompts = z.strictObject({
  identityAdditions: nonEmpty,
  securityAdditions: uniqueScalars,
  taskAdditions: nonEmpty,
})

export const provenanceSource = z.strictObject({
  source: relativeLocator,
  decisionRefs: z.array(decisionReference).superRefine((values, context) => {
    if (new Set(values).size === values.length) return
    context.addIssue({ code: "custom", message: "Decision references must be unique" })
  }),
})
