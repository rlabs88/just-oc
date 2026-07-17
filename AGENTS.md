---
kind: agent-instructions
version: 1
scope: "**/*"
status: active
inherits: null
applies_to: ["**/*"]
---

# just-oc Agent Policy

## Read first

Read the root `STANDARD.md`, then the nearest plugin checkpoint. Treat the
OpenCode plugin types and official OpenCode source as the runtime contract. Use
Linear as the work ledger; do not add issue-specific markdown reports.

## Operating rules

- Keep maintained source under `plugins/<bundle>/`.
- Keep `.opencode/plugins/` files as thin re-export loaders only.
- Let OpenCode own sessions, execution, permissions, tools, authentication, and the agent loop.
- Keep prompts model-neutral unless an issue explicitly requires a model-specific adapter.
- Never commit credentials, absolute machine paths, generated runtime state, copied skill trees, or dependency directories.
- Use Bun for dependency and script execution; retain one `bun.lock`.

## Change boundaries

Add `STANDARD.md` and `AGENTS.md` together only for meaningful ownership
boundaries. Do not recreate legacy agents, research, analysis, deployment,
spike, general test, or orchestration directories in this repository.

## Validation

Run `bun install --frozen-lockfile`, `bun run typecheck`, and
`bun run validate:plugins`. For new agent transforms, add deterministic ignored
smoke validation and remove its fixtures after the run.

## Handoff

Report changed bundles, OpenCode extension points used, validation commands,
and residual provider/runtime limitations. Link the implementing Linear issue
and PR rather than duplicating their history here.
