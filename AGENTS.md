---
kind: agent-instructions
version: 1
scope: "**/*"
status: active
inherits: null
applies_to: ["**/*"]
---

# just-oc Repository Policy

## Read first

Read this file, `CONTEXT.md`, and the nearest bundle checkpoint before editing.
Treat the OpenCode plugin types and official OpenCode source as the runtime
contract. Use Linear as the work ledger; do not add issue-specific markdown
reports.

## Operating rules

- Keep maintained runtime plugins under `plugins/<bundle>/`.
- Keep tracked OpenCode and MCP configuration under the supported OpenCode
  configuration surface; this repository configures OpenCode but does not own
  the OpenCode runtime.
- Keep `.opencode/plugins/` files as thin re-export loaders only.
- Let OpenCode own sessions, execution, permissions, tools, authentication, and the agent loop.
- Keep prompts model-neutral unless an issue explicitly requires a model-specific adapter.
- Never commit credentials, absolute machine paths, generated runtime state, copied skill trees, or dependency directories. Generated global wrappers belong under the user's OpenCode configuration, not in this repository.
- Use Bun for dependency and script execution; retain one `bun.lock`.
- Use `just oc install` to install the local dependency graph and back the global OpenCode plugin wrappers with this checkout. Do not hand-edit generated global wrappers.

## Change boundaries

Add `AGENTS.md` and `CONTEXT.md` together only for meaningful ownership
boundaries. Do not recreate legacy agents, research, analysis, deployment,
spike, general test, or orchestration directories in this repository.
- The former `sandbox/` image graph has been removed. Do not recreate sandbox
  composition, provisioning, toolchains, image validation, or deployment here.
- External consumers may use a pinned clean revision of this repository as
  OpenCode configuration and runtime-plugin source. The consumer owns image
  composition, toolchains, provisioning, validation, publication, host
  lifecycle, caching, ingress, and deployment. Keep consumer-specific overlays
  and generated state in the consumer; do not back-port them here.
- Keep plugin loaders behavior-free apart from re-exporting or delegating to a
  maintained bundle entry point. Do not add a second runtime or scrape private
  OpenCode state.
- Create a new bundle only for cohesive behavior with an independent OpenCode
  entry point, and give it its own local checkpoint pair.

## Scope discipline

- Treat ownership, boundary, and non-goal statements as repository-placement
  constraints only. They do not authorize work in another repository, host,
  credential store, service manager, or publishing workflow.
- Interpret "outside this repository" as "do not implement it here," not as a
  direction to redirect the task elsewhere. Expand the execution surface only
  when the user or implementing Linear issue explicitly selects it.
- For plan-only requests, separate requested outcomes and observed facts from
  optional implementation choices. Do not present inferred deployment,
  persistence, publication, or lifecycle mechanisms as settled requirements.
- Treat external repositories and systems named in checkpoint context as
  references, not active task scope.
- Never add deployment instructions, service definitions, registry workflows,
  host configuration, or secret-manager wiring to this repository merely
  because a consumer imports it.

## Runtime boundaries

OpenCode owns the agent loop, sessions, permissions, authentication, and tool
execution. The server resolves the selected project directory; clients attach
to that server and must not be replaced by a plugin runtime. Keep server URLs,
credentials, Tailnet details, and deployment configuration outside this repo.

Do not add a plugin that scrapes private OpenCode storage, discovers filesystem
roots, or simulates project-catalogue records. Project surfacing belongs to a
supported OpenCode client or server extension point; until one exists, treat it
as an upstream capability gap.

## Invariants and non-goals

- Credentials and hard-coded machine paths never enter tracked files.
- One Bun lockfile describes the TypeScript dependency graph.
- Bundles compile and initialize independently, and no bundle imports another.
  Each bundle asserts this about itself in its own tests. A bundle needing
  session dispatch owns its own; the OpenCode client is the shared surface, not a
  sibling bundle.
- This repository does not own general skills, research archives, deployment
  infrastructure, generated telemetry, test archives, speculative spikes, or
  external submodules.
- Consumer build provenance and deployment policy do not enter this repository.

## Validation

Run `bun install --frozen-lockfile`, `bun run typecheck`, and
`bun run validate:plugins`. For new agent transforms, add deterministic ignored
smoke validation and remove its fixtures after the run.

For installer changes, run `just oc install`, then verify the generated files in
`~/.config/opencode/plugins` point at this checkout and that project-local
loaders suppress duplicate global initialization.

## Handoff

Report changed configuration or bundles, OpenCode extension points used,
validation commands, and residual provider/runtime limitations. Link the
implementing Linear issue and PR rather than duplicating their history here.
