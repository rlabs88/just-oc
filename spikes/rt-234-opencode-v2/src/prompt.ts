import type { ParsedCompilerInputV1 } from "./schema/compiler-input.ts"
import type { RoleSourceV1 } from "./schema/role.ts"
import {
  renderArtifacts, renderDelegation, renderList, renderRequirements,
  renderSection, renderVerdicts,
} from "./prompt-contracts.ts"

export function renderPrompt(input: ParsedCompilerInputV1): string {
  const role = input.role
  const sections = [
    renderSection("Identity Baseline", input.sharedPrompts.identity),
    renderSection("Role Identity", renderIdentity(role)),
    renderSection("Security Baseline", input.sharedPrompts.security),
    renderSecurity(role),
    renderSection("Task Baseline", input.sharedPrompts.task),
    renderSection("Role Task Contract", renderTask(role)),
  ].filter((value): value is string => value !== undefined)

  return `${sections.join("\n\n")}\n`
}

function renderIdentity(role: RoleSourceV1): string {
  return [
    `Name: ${role.displayName}`,
    `ID: ${role.id}`,
    `Version: ${role.version}`,
    `Class: ${role.roleClass}`,
    `Description: ${role.description}`,
    `Purpose: ${role.purpose}`,
    renderList("Responsibilities", role.responsibilities),
    renderList("Non-responsibilities", role.nonResponsibilities),
    renderSection("Role-specific identity additions", role.prompts.identityAdditions, 2),
  ].join("\n\n")
}

function renderSecurity(role: RoleSourceV1): string | undefined {
  const additions = role.prompts.securityAdditions
  if (additions.length === 0) return undefined
  return renderSection(
    "Role Security Additions",
    additions.map((value) => `- ${value}`).join("\n"),
  )
}

function renderTask(role: RoleSourceV1): string {
  return [
    renderList("Authority", role.authority),
    renderList("Escalation", role.escalation),
    renderArtifacts("Inputs", role.inputs),
    renderArtifacts("Outputs", role.outputs),
    renderVerdicts(role),
    renderDelegation(role),
    renderRequirements(role),
    renderSection("Role-specific task additions", role.prompts.taskAdditions, 2),
  ].join("\n\n")
}
