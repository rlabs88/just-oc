---
kind: agent-instructions
version: 1
scope: "plugins/agent-archetype-system/**"
status: active
inherits: "../../AGENTS.md"
applies_to: ["**/*"]
---

# Agent Archetype System Agent Policy

## Read first

Read `STANDARD.md`, `types.ts`, `registry.ts`, and `harness.ts` before editing a
role or integration. Verify extension fields against the pinned OpenCode plugin
and SDK V2 types rather than memory or legacy spike code.

## Operating rules

- Preserve the exact six-section prompt order.
- Preserve `mode: all` for every archetype and Cortex as the project default agent.
- Keep shared prompts model-neutral and role objects declarative. A complete
  role-owned profile must preserve the six-section contract and may not widen
  host authority.
- Keep executable logic flat at the plugin root.
- Let OpenCode own sessions, tools, permissions, execution, and the agent loop.
- Route hooks from host-provided role/session identity and guard every role-specific effect.
- Keep independent tool plugins independent; deduplicate only their stable IDs.
- Reject unknown plugin and hook references and non-portable prompt content.
- Keep the legacy-plugin-to-V2-config cast confined to `index.ts`.

## Change boundaries

Do not add `spikes/`, a persistence layer, orchestration or lifecycle runtime,
copied OpenCode schemas, a `tools/` folder, or additional plugin subfolders.
Adding another archetype is one role file plus typed registry inclusion unless a
concrete OpenCode contract proves more is necessary.

## Validation

Run the root frozen install, type check, and plugin-load validation. Use a
temporary ignored smoke fixture for prompt order, role enablement, invalid
references, plugin deduplication, and hook routing, then remove it. Confirm
OpenCode debug configuration exposes Cortex, Flux, and Zen.

## Handoff

Report role or contract changes, exact deterministic gates, OpenCode load
evidence, and any live-provider limitation. Keep execution history in Linear.
