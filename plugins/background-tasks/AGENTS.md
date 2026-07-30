---
kind: agent-instructions
version: 1
scope: "plugins/background-tasks/**"
status: active
inherits: "../../AGENTS.md"
applies_to: ["**/*"]
---

# Background Tasks Agent Policy

## Read first

Read `STANDARD.md`, `index.ts`, the manager interface, and `shared/dispatch.ts`
before changing a tool or the dispatch path.

## Operating rules

- Preserve the manager as the single lifecycle-state owner.
- Keep OpenCode client adaptation at the tool boundary.
- Keep status transitions explicit and serializable.
- Avoid process-global state and import-time side effects.
- Open child sessions only through `shared/dispatch.ts`. It is bundle-private;
  do not export it from the plugin entry point or import another bundle's copy.
- Never let a settled task be reopened by a late in-flight result.

## Change boundaries

Do not add agent identity persistence, orchestration policy, a provider SDK, or
copied external runtime code. Session creation is in scope for this bundle and
only through the dispatch primitive; owning execution, permissions, auth, or the
agent loop is not.

## Validation

Run root type checking, independent plugin initialization, and `bun test` for
this bundle. Cover any changed lifecycle transition against the fake OpenCode
client in `manager.test.ts`.

## Handoff

State which tools or lifecycle transitions changed and provide the validation
result.
