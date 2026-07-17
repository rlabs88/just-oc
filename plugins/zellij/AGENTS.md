---
kind: agent-instructions
version: 1
scope: "plugins/zellij/**"
status: active
inherits: "../../AGENTS.md"
applies_to: ["**/*"]
---

# Zellij Agent Policy

## Read first

Read `STANDARD.md`, `tool.ts`, `exec.ts`, and the affected domain module.

## Operating rules

- Keep command construction in domain modules and execution in `exec.ts`.
- Validate untrusted arguments before constructing a command.
- Preserve typed success and failure results.
- Keep plugin initialization independent of a running Zellij instance.

## Change boundaries

Do not shell through string concatenation, add a parallel MCP server, or move
OpenCode registration into domain modules.

## Validation

Run root type checking and independent plugin initialization. Use a temporary
ignored fixture for changed routing behavior and remove it after validation.

## Handoff

Name the affected domain operations and provide deterministic validation
evidence.
