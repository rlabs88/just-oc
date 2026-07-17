import type { RoleSourceV1 } from "./schema/role.ts"

export function renderArtifacts(
  label: string,
  values: RoleSourceV1["outputs"],
): string {
  const rendered = values.map((artifact) => [
    `### ${artifact.name}`,
    `Purpose: ${artifact.purpose}`,
    `Media type: ${artifact.mediaType}`,
    `Absence: ${artifact.absence}`,
    "Fields:",
    ...artifact.fields.map((field) => {
      const presence = field.required ? "required" : "optional"
      return `- ${field.name} (${field.valueType}, ${presence}): ${field.description}`
    }),
  ].join("\n"))
  return `## ${label}\n\n${rendered.length === 0 ? "- None." : rendered.join("\n\n")}`
}

export function renderVerdicts(role: RoleSourceV1): string {
  const values = role.verdicts.map((verdict) => [
    `### ${verdict.name}`,
    `Meaning: ${verdict.meaning}`,
    `Gate effect: ${verdict.gateEffect}`,
    renderList("Required evidence", verdict.requiredEvidence, 4),
  ].join("\n"))
  return `## Verdicts\n\n${values.join("\n\n")}`
}

export function renderDelegation(role: RoleSourceV1): string {
  const targets = role.delegation.targets.map((target) => {
    const inputs = renderCsv(target.inputArtifacts)
    const returns = renderCsv(target.returnArtifacts)
    return `- ${target.roleId} (${target.invocation}); inputs: ${inputs}; returns: ${returns}`
  })
  return [
    "## Delegation",
    `Maximum depth: ${role.delegation.maxDepth}`,
    `Maximum concurrency: ${role.delegation.maxConcurrency}`,
    targets.length === 0 ? "Targets:\n- None." : `Targets:\n${targets.join("\n")}`,
  ].join("\n")
}

export function renderRequirements(role: RoleSourceV1): string {
  return [
    "## Runtime requirements",
    `Skills: ${renderCsv(role.requirements.skills)}`,
    `Plugins: ${renderCsv(role.requirements.plugins)}`,
    `Hooks: ${renderCsv(role.requirements.hooks)}`,
  ].join("\n")
}

export function renderList(
  label: string,
  values: readonly string[],
  level = 2,
): string {
  const body = values.length === 0
    ? "- None."
    : values.map((value) => `- ${value}`).join("\n")
  return renderSection(label, body, level)
}

export function renderSection(label: string, body: string, level = 1): string {
  return `${"#".repeat(level)} ${label}\n\n${body}`
}

function renderCsv(values: readonly string[]): string {
  return values.length === 0 ? "none" : values.join(", ")
}
