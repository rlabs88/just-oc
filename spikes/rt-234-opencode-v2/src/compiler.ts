import type { AgentConfig } from "@opencode-ai/sdk/v2"

import { normalizeInput, sha256 } from "./canonical.ts"
import { compilePermissions } from "./permission-compiler.ts"
import { renderPrompt } from "./prompt.ts"
import type { CompiledRoleV1, CompilerInputV1 } from "./role-schema.ts"
import { resolveRuntime } from "./runtime.ts"
import { compilerInputSchema } from "./schema/compiler-input.ts"
import { compiledRoleSchema } from "./schema/compiler-output.ts"
import { validateCompilerInput } from "./validate.ts"

export function compileRole(source: CompilerInputV1): CompiledRoleV1 {
  const input = compilerInputSchema.parse(normalizeInput(source))
  validateCompilerInput(input)
  if (!input.role.enabled || input.overlays.some((overlay) => overlay.enabled === false)) {
    throw new Error(`Role is disabled: ${input.role.id}`)
  }

  const permission = compilePermissions(input)
  const runtime = resolveRuntime(input)
  const binding = {
    plugins: input.role.requirements.plugins,
    hooks: input.role.requirements.hooks,
    skills: input.role.requirements.skills,
  }
  const agentConfig: AgentConfig = {
    description: input.role.description,
    mode: input.role.mode,
    hidden: input.role.hidden,
    prompt: renderPrompt(input),
    model: runtime.model,
    ...(runtime.variant ? { variant: runtime.variant } : {}),
    temperature: runtime.temperature,
    steps: runtime.steps,
    permission,
  }

  return compiledRoleSchema.parse({
    agentId: input.role.id,
    agentConfig,
    binding,
    provenance: provenance(input, agentConfig, binding),
  })
}

function provenance(
  input: ReturnType<typeof compilerInputSchema.parse>,
  agentConfig: AgentConfig,
  binding: CompiledRoleV1["binding"],
): CompiledRoleV1["provenance"] {
  const policy = pickPolicy(input)
  const runtimeBinding = {
    model: agentConfig.model,
    variant: agentConfig.variant,
    temperature: agentConfig.temperature,
    steps: agentConfig.steps,
    permission: agentConfig.permission,
    ...binding,
  }
  return {
    schemaVersion: 1,
    roleId: input.role.id,
    roleVersion: input.role.version,
    roleSourceDigest: sha256(input.role),
    policyDigest: sha256(policy),
    sharedPromptDigests: {
      identity: sha256(input.sharedPrompts.identity),
      security: sha256(input.sharedPrompts.security),
      task: sha256(input.sharedPrompts.task),
    },
    compilerVersion: input.pins.compilerVersion,
    opencodeVersion: input.pins.opencodeVersion,
    pluginSdkVersion: input.pins.pluginSdkVersion,
    overlayDigest: sha256({
      hostPermission: input.hostPermission ?? null,
      overlays: input.overlays,
    }),
    bindingDigest: sha256(runtimeBinding),
    outputDigest: sha256(agentConfig),
    decisionRefs: input.role.provenance.decisionRefs,
  }
}

function pickPolicy(input: ReturnType<typeof compilerInputSchema.parse>): unknown {
  const role = input.role
  return {
    authority: role.authority,
    escalation: role.escalation,
    inputs: role.inputs,
    outputs: role.outputs,
    verdicts: role.verdicts,
    delegation: role.delegation,
    permissions: role.permissions,
    requirements: role.requirements,
    securityAdditions: role.prompts.securityAdditions,
  }
}
