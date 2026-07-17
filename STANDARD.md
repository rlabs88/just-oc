---
kind: repository-standard
version: 1
scope: "**/*"
status: active
---

# just-oc Repository Standard

## Purpose

This repository owns a compact collection of project-local OpenCode plugins and
the configuration needed to load them. It exists to extend OpenCode through its
supported plugin surface, not to replace the OpenCode runtime.

## Boundaries

- `plugins/` is the only maintained implementation root.
- `.opencode/plugins/` contains autoloaded re-export loaders.
- `.opencode/opencode.json` contains project configuration without credentials or absolute paths.
- `.agents/index.yaml` indexes external source references for OpenSrc and DeepWiki.
- `kilo.jsonc` is the sole Kilo-specific tracked configuration.

The maintained direction is three independent bundles: Background Tasks,
Zellij, and Agent Archetype System. Each bundle owns its entry point and local
implementation modules.

## Documentation ownership

TypeScript and configuration define behavior. Bundle `STANDARD.md` files explain
why a boundary exists; bundle `AGENTS.md` files govern edits. Linear owns issue
scope, execution evidence, and migration history.

## Invariants

- OpenCode owns the agent loop, sessions, permissions, authentication, and tool execution.
- Plugin loaders contain no behavior beyond re-exporting a bundle entry point.
- Credentials and hard-coded machine paths never enter tracked files.
- One Bun lockfile describes the TypeScript dependency graph.
- Bundles compile and initialize independently.

## Extension rules

Create a new bundle only for cohesive behavior with an independent OpenCode
entry point. Give every meaningful bundle a `STANDARD.md` and `AGENTS.md` pair.
Prefer declarative configuration and small transforms over parallel runtimes.

## Validation

Type checking, independent plugin initialization, and project-loader imports are
mandatory. Provider live-response checks are useful evidence but are not a
substitute for deterministic load validation.

## Non-goals

This repository does not own general agents, skills, research archives,
deployment infrastructure, Python applications, generated telemetry, test
archives, speculative spikes, or external submodules.
