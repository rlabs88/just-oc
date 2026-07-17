# Repository and Plugin Architecture

## Decision record

**Status:** Selected for RT-234 implementation planning.

**Decision:** Use a private Bun workspace whose production extension units are
independent plugin bundles under `plugins/`. Keep OpenCode configuration thin,
portable, and secret-free. Register local workspace plugins through tiny config
adapters during development and package names for installed use. Preserve
Agent Archetypes as one thin configuration/composition plugin. Give mutable
identity/instance/checkpoint state to a separate Agent Continuity plugin rather
than expanding Agent Archetypes into an agent runtime.

## Eligible architectures

| Option | Shape | Benefits | Costs / risks | Result |
| --- | --- | --- | --- | --- |
| A. Bun workspace plugin bundles | Root private workspace; one package per `plugins/*`; thin `.opencode` config/adapters | Clear ownership, independent tests/entry points, local development and later publishing, accepted Agent Archetypes structure | Small workspace/config adapter seam to validate | **Selected** |
| B. Single `.opencode/plugins` package | All plugin source loaded directly by OpenCode from one config tree | Fewest package files, native local discovery | Recreates monolith, couples lifecycles/state, weak independent retention/versioning | Eligible only for a disposable prototype |
| C. Separate repository per plugin | Published packages and independent release trains | Strongest isolation and installation story | Premature operational/versioning overhead for four small bundles | Defer until a plugin proves independent lifecycle demand |

Option A has the least ownership ambiguity without creating a repository per
plugin. It also preserves the accepted requirement that useful plugins remain
independent folder bundles.

## Target source tree

```text
just-oc/
├── .opencode/
│   ├── opencode.jsonc
│   ├── package.json
│   └── plugins/                 # tiny local-dev adapters, no domain logic
├── plugins/
│   ├── agent-archetypes/
│   │   ├── prompts/
│   │   │   ├── base-identity.ts
│   │   │   ├── security.ts
│   │   │   └── base-task.ts
│   │   ├── roles/
│   │   │   ├── cortex.ts
│   │   │   ├── flux.ts
│   │   │   └── zen.ts
│   │   ├── harness.ts
│   │   ├── hooks.ts
│   │   ├── types.ts
│   │   ├── registry.ts
│   │   ├── standard.md
│   │   └── index.ts
│   ├── agent-continuity/        # separate follow-up after spike gate
│   ├── background-tasks/
│   └── zellij/
├── tests/
│   ├── fixtures/
│   ├── integration/
│   └── compatibility/
├── docs/rt-234/
├── spikes/rt-234-opencode-v2/  # removable proof, not production source
├── STANDARD.md
├── AGENTS.md
├── README.md
├── package.json
├── tsconfig.json
└── bun.lock
```

Only `prompts/` and `roles/` are configuration subfolders inside Agent
Archetypes. Executable logic stays flat at that plugin root. No top-level tools
plane, generic prompt framework, or speculative shared package is introduced.

## Plugin ownership

| Bundle | Owns | Does not own | Mutable state |
| --- | --- | --- | --- |
| Agent Archetypes | role schema/source, shared prompts, deterministic compiler, registry, enablement, guarded role hooks, OpenCode agent registration | sessions, model loop, task execution, identity store, provider secrets, tools supplied by other plugins | none beyond process-local validated registry |
| Agent Continuity | identity/control generations, instance index, binding/provenance digests, memory/checkpoint records, migrations, leases, recovery, and the common persistence envelope/adapter | role semantics, prompts, session transcript, dispatch/handoff lifecycle, task executor | adapter-backed state outside Git |
| Background Tasks | background task tools, task/dispatch/handoff lifecycle, work index/artifact records, bounded queue, cancellation/disposal | canonical identity, role prompts, session transcript, terminal UI | lineage and contract/artifact locators through the Continuity storage port; mutable queue state stays process-local |
| Zellij | optional terminal-session detection and tool/hook integration | session truth, identity, background-task lifecycle | no durable state; query Zellij on demand |
| OpenCode | agents at runtime, sessions/messages, model execution, tools, permissions/approvals, provider auth | `just-oc` role source and continuity metadata | OpenCode data store |

Agent Continuity imports only the public role/provenance schemas from Agent
Archetypes. Background Tasks imports those artifact schemas and the Continuity
storage port; it cannot read identity-store internals. Other integration uses
OpenCode hooks/events and named artifact references. A general event bus or
`shared/` package is prohibited until three concrete consumers require the same
stable contract.

### Phase 1 owner-to-module mapping

The abstract owners frozen in Phase 1 map to exactly one package/module:

| Frozen owner | Concrete package/module | Public seam |
| --- | --- | --- |
| Agent Archetypes package; role registry; role compiler; binding compiler | `@just-oc/agent-archetypes` `registry.ts`, `harness.ts`, `index.ts` | role/compiler schemas, `compileRegistry`, plugin |
| Identity domain/store/service; Continuity service; instance store/index | `@just-oc/agent-continuity` identity and instance domain plus adapter | identity/control/instance schemas and `ContinuityService` |
| Memory service/store; checkpoint service/store | `@just-oc/agent-continuity` memory/checkpoint domain | validated record methods on `ContinuityService` |
| Dispatch service; handoff service; work index; work-artifact store | `@just-oc/background-tasks` | named task/dispatch/handoff schemas and storage-port calls |
| OpenCode config, sessions, execution, and enforcement | OpenCode `1.17.5` | final `config`, `event`, permission, session, and tool hooks |

The mapping preserves the Phase 1 payload/lifecycle distinction: Continuity
provides the common validated storage port but does not thereby own task or
handoff lifecycle. Background Tasks writes only lineage, state transitions,
contract digests, and relative artifact locators through that port.

## Package graph and public interfaces

```text
root workspace (dev/test only)
├── @just-oc/agent-archetypes -> @opencode-ai/plugin, @opencode-ai/sdk/v2, zod
├── @just-oc/agent-continuity -> @just-oc/agent-archetypes/contracts, @opencode-ai/plugin, @opencode-ai/sdk/v2, zod
├── @just-oc/background-tasks -> @just-oc/agent-archetypes/contracts, @just-oc/agent-continuity/storage, @opencode-ai/plugin, @opencode-ai/sdk/v2, zod
└── @just-oc/zellij -> @opencode-ai/plugin, @opencode-ai/sdk/v2
```

Public surfaces stay narrow:

- Agent Archetypes exports the OpenCode plugin, `RoleSourceV1` and
  `CompiledRoleV1` runtime schemas/types, `compileRegistry(input)`, and a
  read-only validated registry lookup.
- Agent Continuity exports its OpenCode plugin, `ContinuityStorageAdapter`,
  `ContinuityService`, versioned identity/control/instance/memory/checkpoint
  schemas, result/error unions, and explicit migrations.
- Background Tasks exports its OpenCode plugin and versioned
  task/dispatch/handoff schemas. Zellij exports only its plugin and capability
  result type.

Plugin internals are not cross-imported. Package `exports` maps expose only
`.`, `./contracts`, and (for Continuity) `./storage`. OpenCode,
`@opencode-ai/plugin`, and every direct `@opencode-ai/sdk` dependency are exact
`1.17.5` pins; no workspace package relies on a transitive SDK version.

## Configuration and installation

### Layering

The repository config contains plugin selection and a portable model default.
Provider credentials are injected with `{env:NAME}` or a secret file; they do
not live in the repository, plugin options, fixtures, logs, or generated output.

OpenCode's documented configuration precedence remains authoritative. The
plugin receives OpenCode's already-merged host config plus its own strictly
parsed options. Options may disable roles, select allowlisted runtime bindings,
or narrow permissions. Versioned plugin/hook/skill requirements cannot be
dropped: an unavailable requirement fails compilation unless the whole role is
disabled. Options cannot change canonical role semantics or widen policy.

The Agent Archetypes `config` adapter passes `config.permission` through the
Phase 2 host-permission adapter and passes every existing `config.agent` key as
an occupied ID. It compiles all enabled roles into a temporary map before one
replacement assignment. It never spreads role fields or raw host config into
the emitted `AgentConfig`.

### Project-local development

1. `bun install --frozen-lockfile` at the workspace root.
2. Set `OPENCODE_CONFIG_DIR` to the repository's `.opencode` directory or use a
   fixture project with a project-local `.opencode` directory.
3. Tiny `.opencode/plugins/*.ts` adapters re-export package entry points. They
   contain no logic and are covered by a load smoke test.

No adapter contains an absolute path. The adapter seam is removed if the pinned
OpenCode release proves a stable workspace-package loading mechanism.

### Installed use

Installed config references exact package versions, not local `file://` URLs.
Global installation is opt-in and uses OpenCode's config directory. Project
configuration can select the same packages locally. Installation never replaces
user provider/model preferences without an explicit merge. A single portable
setup flow replaces the two current symlink scripts.

## Lifecycle contracts

### Initialization

1. Each plugin factory parses options and constructs process-local state without
   mutating OpenCode config or durable records.
2. The Agent Archetypes `config` hook validates registry, schema/pins,
   requirements, host permission, and occupied IDs; it compiles all enabled
   roles into a temporary map and replaces only its previously owned agent IDs
   after every role succeeds.
3. Agent Continuity opens the workspace adapter, integrity-checks and migrates
   state, then enables event handling only after active identity resolution.
4. Background Tasks admits work only after its bounded queue and storage port
   are ready; no orphaned in-memory work is represented as successful.
5. Zellij detects capability lazily; absence returns `unavailable` and disables
   its integration cleanly.

The only OpenCode lifecycle surfaces used at the exact pin are the plugin
factory plus `config`, `event`/guarded execution hooks, and `dispose`. A hook
invoked before readiness returns a typed unavailable/blocked result; it does not
partially initialize the plugin.

### Disposal and reload

- `dispose` is idempotent: the first call switches the plugin to `disposing`,
  stops admission/listeners, closes resources, and reaches `disposed`; later
  calls return the same settled promise.
- Agent Archetypes releases process-local caches only.
- Agent Continuity atomically flushes validated metadata/checkpoint references
  and releases leases.
- Background Tasks stops admission, checkpoints supported work, cancels or
  marks remaining work orphaned, and removes timers/listeners.
- Zellij removes listeners and never kills user sessions implicitly.
- Reload creates a fresh plugin instance and runs full initialization/config
  validation again. No module-global listener, timer, lease, or agent ownership
  survives disposal; stale hooks or duplicate registration are test failures.

### Concurrency and recovery

The continuity adapter uses workspace leases, monotonic generations, and
compare-and-swap updates. Task queues are bounded and per-parent ordering is
explicit. Duplicate resume, double disposal, partial writes, missing sessions,
and unavailable Zellij/provider capabilities return typed blocked/conflict
results; they do not fabricate completion.

### Observability and security

Each bundle emits structured, namespaced logs with plugin version, workspace
digest, event name, result class, and safe identifiers. Logs exclude prompt
content, session messages, secrets, environment values, raw tool output, and
absolute home paths. Metrics are counters/durations, not identity or memory.
Sensitive/destructive actions remain behind current OpenCode permissions.

## Storage adapters

Agent Continuity starts with one local JSON adapter under OpenCode's data
directory. `ContinuityStorageAdapter` exposes only: load/list immutable
generations, write-generation-if-absent, load/CAS identity control, validated
namespaced record get/put, append journal, acquire/renew/release lease, archive,
integrity check, and idempotent close. Every write passes the Phase 1 common
persistence envelope before the adapter. Tests use an in-memory fake implementing
the same contract. A database or remote adapter is YAGNI until multi-process or
cross-machine continuity is required.

Corrupt-latest recovery never guesses a record. It rejects an invalid control
pointer/generation, verifies the append journal and immutable generations, and
returns the newest journal-confirmed valid generation as a repair candidate.
Selecting that candidate still requires an active identity, lease, and control
CAS; otherwise the result is blocked/conflict and no state is changed.

The repository contains schemas, migrations, and fixtures only. Runtime stores,
leases, session data, logs, and generated prompt output are ignored.

## Test architecture

| Layer | Proves |
| --- | --- |
| Schema | Valid/invalid role, identity, instance, overlay, and migration fixtures |
| Unit | prompt order/normalization/digests; permission intersection; lifecycle transitions; registry errors |
| Plugin integration | config mutation, enablement, hook routing, plugin deduplication, init/dispose/reload, adapter recovery |
| Fixture repository | project-local `.opencode` discovery and no machine-specific paths/secrets |
| OpenCode compatibility | exact CLI/SDK pin loads plugins/roles, emits current fields, enforces permission routing, and survives upgrade fixture |
| Security/portability | credential signatures, ignored runtime state, case collisions, absolute paths, deterministic output |

Tests are written before production behavior. Compatibility checks run against
the exact pin and again against any proposed upgrade before pins move.

## Strangler migration

### Gate 0 — contain and preserve

- Revoke the exposed provider credential; keep MiniMax absent from active
  configuration unless a future requirement explicitly restores it.
- Record legacy commit `f9dc39d9e0ebaa3243c2464bd69eba85e58ca522`.
- RT-235 creates and pushes `legacy/pre-agent-archetypes` at that exact commit.
- Rollback: switch to the archival branch after confirming the credential is
  revoked; never restore it as an active secret.

### Gate 1 — RT-235 cleanup

- Build the minimal Bun workspace and config boundary.
- Remove legacy role trees, generated/runtime/unrelated surfaces, dual lockfile,
  absolute paths, and case-colliding copied skills from active `main`.
- Retain only independently validated plugin bundles.
- Rollback: close the cleanup PR; legacy branch remains unchanged.

### Gate 2 — RT-236 Agent Archetypes

- Create `standard.md` before role content.
- Add shared prompts, typed Cortex/Flux/Zen sources, compiler, registry, guarded
  hooks, and compatibility tests.
- Do not add continuity, sessions, task execution, tools, or generic runtime.
- Rollback: disable/remove the plugin package; cleaned RT-235 base remains.

### Gate 3 — Agent Continuity follow-up

- Implement the already-specified identity/instance adapter and recovery behind
  opt-in config after the architecture spike passes.
- Start with local JSON storage and no raw session/work-state duplication.
- Rollback: disable continuity; declarative archetypes continue to load.

### Gate 4 — retained plugin hardening and install

- Migrate background tasks only after its disconnected lifecycle modules pass
  init/dispose/recovery tests; keep Zellij optional and independently loadable.
- Validate project-local and installed package flows.

No gate deletes its rollback anchor before the next gate passes. Quarantined
legacy/generated content is never copied into new source packages.

## Documentation checkpoints

- Root `STANDARD.md` records architectural rationale and links this decision.
- Root `AGENTS.md` records repository policy and migration safety only.
- `plugins/agent-archetypes/standard.md` is required because its two-folder and
  composition rules are locally specific and accepted in RT-234.
- Other plugin-local `STANDARD.md`/`AGENTS.md` files are added only when root
  guidance is insufficient. Empty symmetry checkpoints are forbidden.

## Consequences

- RT-235 and RT-236 remain independently mergeable and preserve the accepted
  clean-main sequence.
- Mutable continuity is a separate plugin/follow-up, preventing Agent Archetypes
  from becoming an agent loop or session manager.
- Local adapters are a deliberately tested development seam, not production
  ownership.
- Independent plugin packages add a small amount of metadata in exchange for
  explicit lifecycle, entry-point, and test boundaries.
