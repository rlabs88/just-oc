---
kind: repository-standard
version: 1
scope: "plugins/agent-archetype-system/**"
status: active
---

# Agent Archetype System Standard

## Purpose

The Agent Archetype System is a thin, typed configuration and prompt-composition
layer for the Cortex, Flux, and Zen OpenCode agents. OpenCode remains the sole
owner of sessions, execution, permissions, tools, provider authentication, and
the agent loop.

## Structure

The plugin has exactly two configuration subfolders:

- `prompts/` owns the shared identity, security, and task baselines.
- `roles/` owns one declarative typed object per archetype.

Executable composition stays flat at the plugin root. `harness.ts` maps roles to
the pinned OpenCode V2 agent fields, `hooks.ts` routes supported host hooks,
`registry.ts` validates and resolves configuration, and `index.ts` is the small
plugin entry point. Do not add a runtime, sessions, persistence, orchestration,
tool schemas, or additional subfolders without a demonstrated integration need.

## Prompt contract

Every final agent prompt contains these sections in this exact order:

1. Base Identity
2. Role Identity
3. Shared Security
4. Role Security Additions
5. Base Task Behavior
6. Role Task Behavior

Shared prompts are detailed, model-neutral host behavior. Role prompts normally
narrow that baseline without overriding its security or truthfulness boundaries.
Cortex owns a complete six-section profile because its execution and continuity
contract is intentionally denser; the harness still composes the same ordered
sections, while Flux and Zen continue to use the shared baselines.

## Typed role configuration

Each role declares a stable ID, display metadata, enablement, OpenCode mode and
visibility, model settings, current OpenCode permissions, independent plugin
selection, supported hook selection, and prompt additions. Role files contain
no registration logic or side effects. Local metadata is consumed before the
agent object reaches OpenCode.

The implementation targets `@opencode-ai/plugin` and `@opencode-ai/sdk` 1.17.5.
The SDK V2 `Config`, `AgentConfig`, and `PermissionConfig` types are the
compatibility contract. The plugin package's config-hook type currently exposes
an older SDK shape, so `index.ts` contains the single narrow host-boundary cast;
the harness accepts only the V2 config contract. Do not spread compatibility
casts elsewhere.

## Plugin and tool ownership

Background Tasks, Zellij, and Command Run remain independent bundles with their
own project autoloaders and tool ownership. Archetypes select those stable
plugin IDs as configuration metadata; the registry deduplicates the selection.
The Agent Archetype System never copies their tools or autoloads a second
instance. The pinned host does not apply the typed per-agent `tools` field, so
the OpenCode permission map is the authoritative per-agent Command Run gate.
Every enabled archetype selects Command Run and explicitly allows the parent
tool plus each constituent permission; role prompts still decide how strongly
an archetype prefers that shared capability.

Cortex's validated compressed catalogue denies the native `read`, `glob`,
`grep`, and `edit` permissions; `edit` is the host permission that controls the
exposed `apply_patch` tool. The corresponding Command Run constituent
permissions remain explicitly allowed. Native `bash`, `webfetch`, `task`,
`todowrite`, and `skill` stay available because Command Run does not fully
replace their interactive, delegation, or host-owned behavior. The typed
catalogue can be switched back to `hybrid` without changing the role's base
permission policy. The validated host exposes no separate native media tool;
Command Run's bounded `read_media` attachment path remains enabled, while
unsupported media formats stay an explicit limitation rather than silently
re-enabling the general native `read` tool.

## Hook routing

Register only hooks declared by the pinned plugin API. The `chat.message` hook
observes the host-provided agent for a session. Tool hooks route only when that
session belongs to an enabled registered archetype and the role selects the
semantic hook. OpenCode permission configuration remains authoritative; the
plugin does not install a parallel permission hook.

Cortex continuity is reconstructed from OpenCode-owned session messages. A
completed Command Run tool part may contribute one validated, bounded task
checkpoint. The ordered, unique task-type set selects static allowlisted
manuals; a legacy single task type is normalized during reconstruction.
Checkpoint context is optional and never becomes system instruction. Compaction
hooks append an operational handoff request and label model-authored checkpoint
context as untrusted provenance. Live hook state is only an optimization over
that transcript authority.

## Enablement

Disabled roles are omitted from the generated agent table. Delegation
permissions referencing a disabled archetype are filtered from enabled agent
objects. Hook routing ignores disabled and unknown agents. Every enabled
archetype uses `mode: all`, making it selectable as a primary session agent and
callable as a subagent. Cortex is the project `default_agent`.

## Adding an archetype

Adding a future archetype requires one declarative file in `roles/`, its stable
ID in the typed ID list and registry, and focused validation of prompt order,
references, enablement, and hook routing. Add a new hook or plugin ID only when a
real supported integration consumes it.

## Validation

Mandatory gates are frozen Bun installation, TypeScript checking, independent
plugin and loader initialization, deterministic temporary smoke checks for
prompt order, disabled roles, bad references, deduplication, and routing, plus
an OpenCode config-load check. Live provider response is useful evidence but is
not a gate when the host provider/database path fails independently.

## Non-goals

No standalone agent framework, file-backed identity, session store, lifecycle
framework, orchestration engine, general prompt framework, duplicated tool
schema, role-specific package, or speculative compatibility layer belongs here.
