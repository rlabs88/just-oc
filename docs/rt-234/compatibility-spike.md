# OpenCode 1.17.5 Compatibility Spike

## Result

The removable spike under [`spikes/rt-234-opencode-v2/`](../../spikes/rt-234-opencode-v2/)
proves the critical RT-234 seams against OpenCode, `@opencode-ai/plugin`, and
`@opencode-ai/sdk` exactly `1.17.5`. It is not production RT-235/RT-236 source.

The final local gates pass:

| Gate | Result |
| --- | --- |
| `bun install --frozen-lockfile` | exact lockfile, no dependency changes |
| `bun test` | 36 tests, 0 failures, 125 assertions, one five-role snapshot |
| `bun run typecheck` | strict TypeScript pass |
| `bun run compatibility` | real OpenCode `1.17.5` loads the Luna default, five compiled agents, and Cortex → Focused Builder task routing |

The compatibility runner creates isolated home/config/data/cache/state roots,
points `OPENCODE_CONFIG_DIR` at the fixture, verifies the CLI version before
loading, parses `opencode debug config`, and deletes its runtime directory. This
prevents the legacy parent/global configuration from contaminating the proof.
The fixture and every representative role select `openai/gpt-5.6-luna`.

## Preserved TDD evidence

The first compiler test run failed before implementation with a missing compiler
module: zero passed, one failed, and one module-load error. The persistence and
plugin-lifecycle increment likewise began RED: missing identity/plugin modules,
plus the then-unrepaired portability, verdict, and delegation counterexamples,
produced 17 passes, five failures, and two module-load errors.

Each independent Phase 2 FAIL remains in the Linear phase thread. Its exact
counterexamples were added before the corresponding repair, including reserved
permission collisions, registry/occupied IDs, arbitrary path and credential
forms, named delegation inputs/returns, host permissions, runtime output
schemas, conflicting verdicts, and deterministic custom-tool ordering.

## Proven behavior

### Role compiler

- One strict Zod-backed `RoleSourceV1` produces supported `AgentConfig` fields,
  binding metadata, and reproducible Phase 1 provenance digests.
- Five complete primary/coordinator/worker/reviewer/operations roles compile to
  a byte-frozen golden snapshot without schema exceptions.
- Host and typed overlays only narrow; unknown tools remain denied; task routing
  is derived from named delegation contracts.
- Complete-registry validation rejects source drift, occupied IDs (including
  host IDs outside the canonical role-ID grammar), missing capabilities,
  built-in/custom collisions, disabled or cyclic targets, unresolved artifacts,
  and conflicting verdict effects before config mutation.

### Plugin lifecycle

- The exact `@opencode-ai/plugin` factory and `config`/`dispose` hooks are used.
- Existing host agents are preserved and passed as occupied IDs; the final host
  permission is adapted before compilation.
- All roles compile into a temporary map before one config assignment. A
  collision leaves config unchanged.
- Repeat config replaces only plugin-owned roles. Disposal is idempotent and a
  disposed instance rejects further config.

### Durable identity

- A local JSON adapter persists canonical `just-oc.agent/<role>` and
  `ws_<SHA-256>` identifiers, workspace-claim evidence, immutable generations,
  an identity-wide control/status-epoch record, append journal, and exclusive
  file lease outside Git.
- One canonical encoder derives the workspace ID from
  `just-oc.workspace.v1\0<kind>\0<sourceId>`; both input and generation schemas
  reject a digest-shaped ID that does not match the stored claim.
- Create, migrate, resume, and revoke use strict runtime schemas; control changes
  use compare-and-swap while the service holds the identity lease.
- A corrupt selected generation is never guessed: recovery selects a lower
  schema-valid, journal-confirmed generation, CAS-repoints control, and records
  the recovery event.
- Create and migrate use an idempotent generation → control CAS → committed
  journal protocol. Tests interrupt after each durable write and prove a retry
  adopts only matching intent, finishes the transaction, and emits exactly one
  generation-committed event.
- Revocation remains identity-wide after service reload. The common persistence
  envelope rejects credential/path signatures and forbidden prompt, transcript,
  reasoning, tool-output, environment, and todo fields before adapter writes.

## Security and portability checks

The active repository configuration no longer declares MiniMax and selects
`openai/gpt-5.6-luna`; OpenAI authentication remains in OpenCode's user-owned
OAuth store and is never copied into the repository. Runtime and `.env` state
are ignored. Production spike source contains no literal machine home
path, provider credential, or private key. Tests use constructed synthetic
credential shapes solely to prove rejection. Role content permits HTTPS and
repository-relative locators while rejecting POSIX, Windows drive, home-relative,
UNC, timestamp, provider/cloud/GitHub-token, and private-key signatures.

## Boundaries and follow-up

- The OpenCode smoke proves plugin discovery, config mutation, role fields, and
  task routing without invoking a paid model or external provider. Its oracle
  asserts the exact five-role set, Luna on every role, the Luna host default,
  and Cortex task routing. The default
  OpenCode directory also resolves `openai/gpt-5.6-luna` with an existing OpenAI
  OAuth login. A live Luna request was attempted but the local OpenCode data
  store failed its SQLite migration on missing column `replacement_seq` before
  model execution; this is not evidence of a Luna or OAuth rejection.
- The file adapter proves one-host mutual exclusion. Production Agent Continuity
  must add renewable leases, stale-owner recovery, migration fixtures, archive,
  instances/tasks/memory/checkpoint/handoff schemas, and controlled shutdown.
- The spike imports representative sources from test fixtures. RT-236 replaces
  them with Cortex/Flux/Zen production sources only after RT-235 cleanup.
- The current legacy test/package failures, symlinks, absolute plugin URLs,
  submodules, copied skills, and dual lockfile are RT-235 inputs, not spike
  dependencies.
- Provider-side MiniMax revocation still requires an authenticated account owner;
  repository containment does not prove revocation.
