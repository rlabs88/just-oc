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

Read `STANDARD.md`, `index.ts`, and the manager interface before changing a tool.

## Operating rules

- Preserve the manager as the single lifecycle-state owner.
- Keep OpenCode client adaptation at the tool boundary.
- Keep status transitions explicit and serializable.
- Avoid process-global state and import-time side effects.

## Change boundaries

Do not add sessions, agent identity persistence, orchestration policy, or copied
external runtime code.

## Validation

Run root type checking and independent plugin initialization. Exercise any
changed lifecycle transition with a temporary ignored smoke command.

## Handoff

State which tools or lifecycle transitions changed and provide the validation
result.
