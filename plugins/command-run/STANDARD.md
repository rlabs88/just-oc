---
kind: repository-standard
version: 1
scope: "plugins/command-run/**/*"
status: active
---

# Command Run Bundle Standard

## Purpose

This bundle provides one bounded, dependency-aware OpenCode tool for core local
software-engineering commands, public web extraction and download, and local
text/image/PDF inspection. It is independently loadable and owns no agent,
session, provider, authentication, or runtime state.

## Runtime contract

OpenCode owns the agent loop and calls `command_run` through the supported plugin
tool surface. Each constituent command asks through its dedicated
`command_run_<type>` permission. Progress uses tool metadata; final TUI toasts are
best-effort compatibility notices and never replace the ordered result.

Steps are dependency barriers. Read-only work may overlap within a step;
mutations remain exclusive. A failed, denied, or aborted command prevents later
steps from launching. Paths remain inside the session directory after symlink
resolution, process output is bounded, and shell children are cancellable.

Shell permissions always evaluate the original command. After approval, RTK may
optionally rewrite that command for semantic output reduction; the bundle owns
no rewrite rules and fails open to raw execution when RTK cannot provide a
usable rewrite. `RTK_DISABLED=1` explicitly selects raw execution. Rewritten
commands disable RTK telemetry and tee output, and keep any RTK database or tee
state disabled through the null device. Compound or environment-mutating shell
commands stay raw so command-local expansion cannot override those controls.

Task status carries a broad task group, an ordered unique set of allowlisted
manual types, a lifecycle status, and an optional bounded phase checkpoint. A
legacy single manual value is normalized for transcript compatibility. Task
status remains inert metadata and never grants permission or runtime authority.

## Exclusions

The bundle does not dispatch native OpenCode tools, patch OpenCode, store session
state, provide an agent loop, query a search provider, generate media, or process
video. Web discovery is direct-URL retrieval only because the pinned plugin API
does not expose a host-authenticated search executor.
