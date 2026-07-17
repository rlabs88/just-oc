# Persistent Agent Identity

## Decision

`just-oc` separates immutable role releases from workspace-persistent identity
records and session-bound executions. OpenCode remains the owner of sessions,
messages, model execution, tool invocation, and approval prompts. The harness
owns only the minimum metadata needed to reproduce an agent definition, bind it
to a workspace, enforce its policy ceiling, and recover explicit work artifacts.

## Concept ownership

Each ownership facet has exactly one authority. A producer may author a payload,
but that does not make the producer its lifecycle or enforcement owner.

| Concept | Source owner | Payload owner | Lifecycle owner | Index owner | Enforcement owner | Persistence |
| --- | --- | --- | --- | --- | --- | --- |
| Role | Agent Archetypes package | Agent Archetypes package | Role registry | Role registry | Role compiler | Git release |
| Identity | Identity domain | Identity store | Identity service | Identity store | Identity service | Workspace-scoped |
| Runtime binding | Role compiler | OpenCode config | Binding compiler | Instance index | OpenCode | Recomputed; digest indexed |
| Instance | Continuity service | Instance store | Continuity service | Instance store | OpenCode | Workspace-scoped metadata |
| Session | OpenCode | OpenCode | OpenCode | OpenCode | OpenCode | OpenCode storage |
| Task | Dispatch service | Work-artifact store | Dispatch service | Work index | Dispatch service | Workspace-scoped lineage metadata |
| Memory | Memory service | Memory store | Memory service | Memory store | Memory service | Separate from identity |
| Checkpoint | Checkpoint service | Checkpoint store | Checkpoint service | Checkpoint store | Checkpoint service | Separate from identity |
| Handoff | Handoff service | Work-artifact store | Handoff service | Work index | Handoff service | Separate from identity |

The role is the source of behavior. Identity proves which immutable role and
policy lineage an agent represents. An instance says where that identity is
currently executing. None of these records contains raw chain-of-thought,
provider credentials, or the full session transcript.

## Identity and scope

### Canonical identifiers

- Role ID: lowercase kebab case, for example `cortex`, `flux`, or `zen`.
- Canonical identity ID: `just-oc.agent/<role-id>`.
- Role version: semantic version for behavioral/policy compatibility.
- Identity schema version: independent integer, beginning at `1`.
- Instance ID: generated ULID; never derived from a model or session title.
- Workspace ID: `ws_` plus the SHA-256 digest of the canonical workspace claim
  defined below; it is never derived from an absolute filesystem path.

A role version changes when its behavior contract changes. Patch versions may
clarify wording without changing inputs, outputs, authority, or verdicts. Minor
versions add backward-compatible capability or artifacts. Major versions change
authority, handoff contracts, or compatibility. Generated prompt checksums do
not replace semantic versions.

### Workspace identity claim

For a Git workspace, setup creates one random UUID in repository-local Git
configuration under `just-oc.workspace-id`. The canonical claim is
`just-oc.workspace.v1\0git-local-uuid\0<uuid>`. Linked worktrees read the UUID
from the repository's common Git configuration, so they share identity; a fresh
clone receives a new UUID; moving the checkout preserves it. A repository may
explicitly import a claim when continuity across clones is intended, but that is
an audited action, never an inference from a remote URL.

For a non-Git workspace, the claim uses a stable OpenCode project ID persisted
by OpenCode: `just-oc.workspace.v1\0opencode-project\0<project-id>`. If neither a
local Git UUID nor a stable OpenCode project ID can be persisted, durable identity
is disabled and execution is ephemeral; hashing the current path is forbidden.

The store keeps the source kind and source identifier beside the digest. A
digest whose stored claim differs from the presented claim is a collision and
fails closed. UUID parse failures, duplicate imported claims, and unavailable
common-worktree configuration also fail before state is loaded.

The executable contract has one canonical encoder for both claim kinds. It
joins `just-oc.workspace.v1`, the source kind, and source identifier with NUL
bytes, hashes those exact UTF-8 bytes with SHA-256, and prefixes the lowercase
hex digest with `ws_`. Input and immutable-generation validation recompute this
value; merely matching the identifier shape is insufficient.

### Scope decision

1. Canonical role definitions are repository-global and immutable per release.
2. Identity records are instantiated per workspace so state cannot leak between
   unrelated repositories.
3. Instances are project/session bound and reference the workspace identity.
4. A global installation supplies code and defaults; project-local config may
   narrow a runtime binding but cannot mutate canonical identity or widen its
   policy ceiling.

## Record boundaries

### Identity record

The minimum durable record contains:

```text
identityId, identitySchemaVersion, roleId, roleVersion,
roleSourceDigest, policyDigest, workspaceId, generation,
createdAt, updatedAt, migratedFrom?
```

Generation records are immutable and append-audited; role releases and policy
digests are never edited in place. Upgrading creates a new generation only after
migration succeeds. Identity-wide control is a separate CAS record:

```text
identityId, status, statusEpoch, activeGeneration,
controlVersion, updatedAt, revokedAt?, revokedBy?, revocationReason?
```

`status` is `active`, `archived`, or `revoked`. Revocation is an irreversible
identity-wide tombstone across every generation. No generation record can
override the control record.

### Instance record

```text
instanceId, identityId, identityGeneration, sessionId,
taskId, dispatchId?, parentInstanceId?, parentSessionId?, bindingDigest,
state, createdAt, updatedAt, recoveredFromInstanceId?
```

`state` is `created`, `running`, `suspended`, `completed`, `failed`, `aborted`,
or `orphaned`. A terminal instance is never resumed in place. Recovery creates
a new instance that points to the prior instance and an explicit checkpoint.

### Task lineage record

```text
taskId, rootTaskId, parentTaskId?, dispatchId?, requestedBy,
assignedIdentityId, inputHandoffIds[], acceptanceContractDigest,
createdAt, closedAt?
```

The work index stores lineage, not mutable todo state or session content.
Delegation creates a child task and unique dispatch ID; its instance references
both. A checkpoint references `taskId` and `instanceId`. A handoff references its
producer task/instance and intended consumer task or role. Recovery retains the
same task ID while creating a linked replacement instance. These references make
delegation, checkpoint, recovery, and handoff lineage deterministic without
copying OpenCode messages.

### Universal persistence exclusions

The following are rejected by the common persistence envelope before **any**
identity, control, instance, task, memory, checkpoint, handoff, journal, or lease
adapter write. An adapter cannot weaken this invariant:

- API keys, OAuth material, environment values, cookies, or secret locators
  that reveal secret content;
- model weights, provider account details, and machine-specific absolute paths;
- raw prompts after compilation, chain-of-thought, hidden reasoning, token
  buffers, transient tool output, and approval-dialog state;
- session transcripts already owned by OpenCode;
- optimization scores, generated research logs, telemetry dumps, and temporary
  benchmark workspaces;
- mutable task todos or local dirty-worktree state;
- permissions granted for only one approval interaction.

A checkpoint that cannot pass the same exclusion validator is not persisted;
there is no "where safe" exception. Persisted task data is limited to identity,
lineage, contract digests, artifact locators, state transitions, and timestamps.

## Runtime binding and authority

The effective runtime binding is compiled for every load. Permissions are the
intersection of:

1. the role's maximum capability policy;
2. repository and organization policy;
3. project-local narrowing;
4. the current user's explicit grant; and
5. plugin/tool availability.

`deny` wins. Missing capabilities remain unavailable. A role, model, prompt, or
restored checkpoint cannot widen its own permissions. OpenCode's current
[permission configuration](https://opencode.ai/docs/permissions/) is the runtime
enforcement boundary; legacy `tools` booleans are not a new source of policy.

Delegation requires all of the following:

- the parent role permits the target role ID;
- effective OpenCode `task` permission allows the route;
- maximum depth and concurrency are not exceeded;
- the child receives a named input/handoff contract;
- the child instance records its parent instance and session;
- the child cannot inherit permissions absent from its own policy intersection.

Escalation returns a blocked/decision handoff to the caller or user. It never
silently substitutes broader authority.

Revoking an identity prevents start, resume, migration, rollback, and recovery
across all generations. Running instances are marked for shutdown at the next
controlled hook; pending work is checkpointed only if it passes the universal
persistence validator. The tombstone and shutdown actions are audit logged.
Revoking a capability narrows the next compiled binding and cannot be overridden
by an old checkpoint.

## Lifecycle contracts

### Identity lifecycle

| Operation | Preconditions | Result |
| --- | --- | --- |
| Create | Valid checked role release; no identity control record | Generation 1 plus atomic active control record |
| Inspect | Valid schema, digests, workspace claim, and control record | Read-only metadata for any status; no executable binding |
| Resolve active | Identity-wide status is `active`; active generation is valid | Selected generation plus freshly compiled binding |
| Migrate | Identity-wide status is `active`; supported source; exclusive lease; matching control CAS | New generation, atomic active pointer swap, migration audit |
| Roll back | Identity-wide status is `active`; target is valid and supported; exclusive lease; matching control CAS | Atomic active pointer swap plus rollback audit; superseded instances drain |
| Archive | No uncontrolled running instances; matching control CAS | Identity-wide archived status; executable operations denied; metadata remains inspectable |
| Revoke | Authorized policy action; matching control CAS | Irreversible tombstone; all generations deny executable operations; running instances enter controlled shutdown |

### Instance lifecycle

| From | Allowed transition | Invariant |
| --- | --- | --- |
| `created` | `running`, `aborted` | Binding digest and session ID recorded first |
| `running` | `suspended`, `completed`, `failed`, `aborted`, `orphaned` | At most one active lease per instance |
| `suspended` | `running`, `aborted`, `orphaned` | Resume revalidates identity and effective permissions |
| terminal/orphaned | none | Recovery creates a new linked instance |

Creating or starting an instance, resuming a suspended instance, migrating,
rolling back, and recovery all call `Resolve active` after acquiring the relevant
lease. Archived identities are inspectable but cannot execute. A rollback never
edits a generation: it validates the target, CAS-swaps `activeGeneration`, and
appends actor, reason, source, target, and prior control version to the journal.
Running instances on the superseded generation receive a shutdown request and
end `aborted`; suspended instances become `orphaned`. Neither can resume, and new
work uses the selected generation.

Persistence uses an adapter with atomic replace, schema validation, monotonic
generation, compare-and-swap updates, and a workspace lease. Disposal flushes
only validated metadata/checkpoint references. A partial write is never treated
as a valid latest generation.

Create and migrate commit in three durable steps while holding the identity
lease: write or adopt an immutable generation with exactly matching semantic
intent; compare-and-swap the active control pointer; then append the unique
`generation-committed` event for that generation/control version. Retrying the
same operation after interruption resumes at the first incomplete step. An
existing generation with different intent fails closed, an already-swapped
matching control is not advanced twice, and an existing matching journal event
is not duplicated. The executable spike injects interruption after each of the
three writes for both create and migrate.

## Storage boundary

The default adapter is a local, workspace-scoped JSON store under OpenCode's
data directory, not the Git worktree. Its logical layout is:

```text
just-oc/
  workspaces/<workspace-id>/
    identities/<identity-id>/generations/<n>.json
    identities/<identity-id>/control.json
    instances/<instance-id>.json
    tasks/<task-id>.json
    checkpoints/<checkpoint-id>.json
    memory/<memory-id>.json
    journal.jsonl
    lease.json
```

The adapter interface permits a future database without changing domain
records. Stored paths are relative locators or OpenCode IDs. Git contains role
sources, schemas, migrations, and fixtures only; generated state is ignored.

## Recovery scenarios

| Scenario | Required behavior |
| --- | --- |
| Plugin process reload | Read the identity-wide control record, resolve its selected active generation, recompute the binding, and continue only non-terminal instances with valid OpenCode sessions. |
| Model unavailable | Select an allowed replacement binding; identity and role version remain unchanged; record the new binding digest. |
| Role upgrade | Validate migration, acquire lease, write a new generation atomically, and retain the prior generation for rollback. |
| Authorized rollback | Require active identity status, validate the target, CAS-swap the active-generation pointer, journal the action, and prevent superseded instances from resuming. |
| Unsupported state version | Refuse mutation, expose a blocked diagnostic, and leave the prior state readable. |
| Corrupt latest record | Reject it, recover the last valid generation/journal entry, and mark a repair event; never guess missing fields. |
| Missing OpenCode session | Mark the instance orphaned; recover into a new session/instance only from an explicit checkpoint. |
| Concurrent resume | Compare-and-swap/lease permits one writer; the loser returns a conflict without starting duplicate work. |
| Identity revoked with older valid generations | The identity-wide tombstone blocks resolve, migrate, rollback, start, resume, and recovery for every generation. |
| Permission revoked while suspended | Recompile on resume, deny now-forbidden work, and emit a blocked handoff. |
| Provider credential absent | Identity still loads; model-bound execution is unavailable and reported accurately. |

## Concrete example

`just-oc.agent/cortex` role version `1.0.0` is instantiated in workspace
`ws_7d…` as identity generation `3`. It starts instance `01K…` in OpenCode
session `ses_…` with a binding digest covering model, permissions, plugins, and
hooks. The model later becomes unavailable. Cortex is rebound to another model
allowed by project policy; neither the identity ID nor role version changes.
After a crash, the old instance becomes orphaned. A new instance references the
old one and a validated checkpoint containing only repository/issue artifact
locators. OpenCode owns both session transcripts.

## Frozen decisions for schema design

1. Typed role source is versioned separately from identity and runtime state.
2. Canonical roles are repository-global; identity/state is workspace-scoped;
   instances are session-bound.
3. OpenCode owns execution and sessions; `just-oc` stores only references and
   reproducibility/policy metadata.
4. Permissions are a deny-wins intersection and are recompiled on every load or
   resume.
5. Secrets, raw reasoning, transcripts, temporary grants, optimization output,
   and mutable/ephemeral work state never enter any persisted adapter record.
6. Migrations create immutable generations; audited rollback atomically selects a
   prior valid generation only while identity-wide control status is active.
7. Terminal instances are immutable; recovery creates linked instances.
8. Storage is adapter-backed, atomic, versioned, workspace-leased, and outside
   the repository worktree.
9. Task, dispatch, instance, checkpoint, and handoff references preserve lineage
   across delegation and recovery without duplicating session content.
10. Archive and revocation are identity-wide; revocation is irreversible and no
    older generation can bypass it.
