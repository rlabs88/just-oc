# Role and Prompt Contract

## Decision

Canonical role sources are declarative TypeScript objects that `satisfy` a
runtime-derived `RoleSourceV1` type. A Zod schema is the single structural
contract; TypeScript infers the authoring type from it. Markdown agent files,
OpenCode JSON, JSON Schema, prompt text, and provenance manifests are compiler
outputs or documentation, never parallel manually edited role sources.

This matches the accepted Agent Archetypes boundary and OpenCode's typed plugin
surface while retaining runtime validation before configuration mutation.

## Representation comparison

| Option | Strengths | Disqualifying cost | Decision |
| --- | --- | --- | --- |
| Markdown + frontmatter | Human-readable; native OpenCode discovery | Weak nested contracts, awkward artifacts/verdicts/delegation, easy prompt/config drift | Generated/debug output only |
| Raw JSON + JSON Schema | Portable and language neutral | Poor prompt authoring, no executable registry references, duplicate TS types unless generated | Exported tooling artifact only |
| Typed TypeScript interface only | Excellent authoring and registry integration | Compile-time checks disappear at runtime; hand-written validators drift | Rejected as incomplete |
| Zod schema + typed TypeScript objects | One runtime and authoring contract, typed registry IDs, deterministic compiler input | Small explicit runtime dependency | Selected |

## Normative schemas

The executable schema is the normative Phase 2 contract, not illustrative
pseudocode. Every semantic object uses a strict Zod object; TypeScript authoring
types are inferred from the same schemas:

- [`role.ts`](../../spikes/rt-234-opencode-v2/src/schema/role.ts) closes
  `RoleSourceV1` and its mode/visibility, artifact, verdict, and evidence rules.
- [`contracts.ts`](../../spikes/rt-234-opencode-v2/src/schema/contracts.ts)
  defines every nested artifact field, verdict, delegation target/bound, runtime
  allowlist/range, requirement set, prompt addition, and source-provenance field.
- [`permissions.ts`](../../spikes/rt-234-opencode-v2/src/schema/permissions.ts)
  defines the complete v1 permission policy.
- [`compiler-input.ts`](../../spikes/rt-234-opencode-v2/src/schema/compiler-input.ts)
  defines the complete role-source/capability registry, occupied agent IDs, raw
  host permissions, typed overlays, shared prompt inputs, and exact pins.
- [`compiler-output.ts`](../../spikes/rt-234-opencode-v2/src/schema/compiler-output.ts)
  strictly runtime-validates emitted AgentConfig, binding, provenance, and the
  complete compiled-role result; all public output types are schema-inferred.

### Closed nested contracts

| Contract | Required fields and closed values |
| --- | --- |
| Artifact field | `name`, `valueType` (`string`, `number`, `boolean`, `json`), `required`, `description` |
| Artifact | `name`, `purpose`, RFC-style media type, absence effect (`blocks`, `allows-partial`), one or more fields |
| Verdict | `name`, `meaning`, gate effect (`pass`, `block`, `continue-with-warning`), output-artifact evidence names |
| Delegation | bounds `0..8` depth and `0..16` concurrency plus unique targets containing role ID, `allow`/`ask`, at least one named target input artifact, and at least one named return artifact; zero targets requires zero bounds |
| Permission | global unknown-tool default fixed to `deny`; nine patterned built-ins; five scalar built-ins; exact registry-backed custom-tool actions; `task` is derived from delegation |
| Requirements | unique skill, plugin, and hook IDs resolved through the capability registry |
| Runtime | non-empty model allowlist/default, variant allowlist/default, temperature min/max/default, and steps max/default |
| Overlay | one unique ordered organization/repository/project/session layer, optional disable, runtime selection, and key-wide permission narrowing actions only |
| Host permission | raw 1.17.5 shorthand or key/action object; granular maps or unsupported wildcard keys fail before agent registration |
| Registry | complete strict role sources, occupied OpenCode agent IDs, and model/plugin/hook/skill/custom-tool IDs; all sources validate atomically |
| Compiler output | OpenCode agent ID/config, non-AgentConfig binding requirements, and full provenance record |

`allow`, `ask`, and `deny` are the only actions. The compiler emits OpenCode
`permission`, never legacy `tools` booleans. The exact supported keys and value
shapes follow the pinned `@opencode-ai/sdk/v2` `PermissionConfig`; see the
[official agent fields](https://opencode.ai/docs/agents/) and
[permission syntax](https://opencode.ai/docs/permissions/).

## Validation rules

### Field validation

- `id` matches `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$` and is unique.
- `version` is valid semantic versioning; `schemaVersion` is exactly `1`.
- names, description, purpose, responsibilities, authority, and prompt sections
  are non-empty after normalization.
- arrays that represent sets are duplicate-free and emitted in source order.
- artifact and verdict names are unique within a role.
- verdict evidence names resolve to the role's declared output artifacts.
- delegation targets, plugin IDs, hook IDs, and skill names resolve in their
  registries; the selected source must exactly match its complete registry
  entry; disabled
  targets, unknown return artifacts, self-delegation, and every registry cycle
  fail.
- permission keys/actions must be accepted by OpenCode `1.17.5`; a requested
  capability cannot exceed the role policy ceiling.
- runtime defaults must belong to their allowlists/ranges; an overlay may select
  only an allowed model/variant/temperature/step count.
- source locators are repository-relative; decision references use stable HTTPS
  links or tracker identifiers.
- prompts/config may not contain credential-shaped literals (including the
  supported provider, cloud, GitHub, and private-key signature families),
  secret values, arbitrary POSIX/Windows absolute paths, timestamps, or
  generated runtime state.
- provenance locators are repository-relative; decision references are `RT-N`
  IDs or HTTPS links.
- security additions append constraints; they cannot replace or reorder the
  shared security module.

### Registry validation

The registry validates all roles together. It rejects duplicate or occupied
OpenCode agent IDs, source/registry drift, unknown model/plugin/hook/skill/custom
tool IDs, custom tools that collide with reserved permission keys, delegation
to disabled roles, missing or unresolved named delegation inputs/outputs, every
cycle, missing artifact contracts, and conflicting verdict gate effects. The
cycle check is a full active-stack graph traversal, not a depth-only heuristic.
Validation completes before any OpenCode config is mutated.

## Prompt composition

Every prompt uses this immutable order:

1. `# Identity Baseline` — normalized shared identity text;
2. `# Role Identity` — name/ID/version/class/description/purpose,
   responsibilities, non-responsibilities, and identity additions;
3. `# Security Baseline` — normalized shared security text;
4. `# Role Security Additions` — optional bullet list, omitted as a whole when
   empty;
5. `# Task Baseline` — normalized shared task text;
6. `# Role Task Contract` — authority, escalation, fully rendered input/output
   contracts, verdicts/evidence, delegation, runtime requirements, and task
   additions.

Each top-level section has exactly one blank-line separator and the whole prompt
has one terminal newline. Narrative lists preserve source order and render one
`- <scalar>` line each; an empty allowed list renders `- None.`. Artifact fields
render as `- <name> (<type>, required|optional): <description>`. Requirement IDs
render comma-separated or `none`. Scalar list items cannot contain newlines.
Source text is normalized to Unicode NFC, LF newlines, and no trailing horizontal
whitespace. Composition never interprets templates, expands environment
variables, accepts workspace-context text, performs network access, or adds a
timestamp. OpenCode remains responsible for repository instructions and session
messages; they are not compiler inputs.

[`prompt.ts`](../../spikes/rt-234-opencode-v2/src/prompt.ts) is the normative byte
renderer. The five-role golden snapshot fixes every heading, separator, list,
artifact, verdict, delegation, and requirement byte.

Shared modules are versioned compiler inputs. A change to any shared module
changes every affected output digest and requires a compatible role release or
an explicitly reviewed shared-policy release.

The Phase 2 spike now supplies substantial executable modules rather than test
sentences:

- [`identity.ts`](../../spikes/rt-234-opencode-v2/src/shared-prompts/identity.ts)
  defines instruction precedence, harness identity, bounded autonomy,
  evidence-first operation, persistence, and user communication.
- [`security.ts`](../../spikes/rt-234-opencode-v2/src/shared-prompts/security.ts)
  defines permission ceilings, untrusted-input handling, secret containment,
  repository/command safety, shared-state authorization, and narrow refusal.
- [`task.ts`](../../spikes/rt-234-opencode-v2/src/shared-prompts/task.ts)
  defines orientation, continuity, tool discipline, implementation/testing,
  delegation, durable evidence, verification, and final handoff.

The modules are a new OpenCode-specific synthesis informed by the exact
comparative sources and hashes in the
[prompt reference index](prompt-reference-index.md). They do not copy product
identity, tool names, hidden context, or provider behavior from either source.
Tests require meaningful module size, critical safety/task concepts, successful
strict compilation, and deterministic digest/snapshot output.

## Override precedence

Prompt semantics and runtime bindings have different precedence.

### Prompt semantics

1. Shared identity/security/task modules are mandatory and cannot be replaced.
2. The immutable role release supplies role identity/security/task additions.
3. OpenCode repository instructions and session messages remain work input, not
   compiler inputs or prompt-source overrides.

Changing semantic prompt content requires a new role or shared-policy version.

### Runtime binding

1. Role defaults are the lowest-precedence replaceable binding.
2. Raw OpenCode host permission is adapted first; overlays are unique and appear
   only in this order: `organization`, `repository`, `project`, `session`.
3. A later overlay may disable the role or select model, variant, temperature,
   and steps only within the source allowlists/ranges.
4. Permission overlay values are key-wide actions only; they meet the role rule
   and every earlier overlay using `allow < ask < deny`.
5. Plugin/hook/skill requirements remain versioned source semantics in v1. If a
   required registry item is unavailable, compilation fails or an overlay
   disables the whole role; requirements are never silently dropped.

A duplicate OpenCode agent ID is a compile error, not an implicit override. The
plugin receives its overlays through typed plugin options and registers only
enabled roles.

### Permission compilation

OpenCode evaluates pattern objects in insertion order with the last match
winning. V1 preserves that behavior inside the role's source rule: every
patterned permission has a required `default` emitted first as `"*"`, followed
by unique authored patterns in source order. Overlays cannot add or reorder
patterns; a key-wide `ask` or `deny` narrows every action in that rule. This
restriction makes cross-layer intersection exact without attempting unsafe glob
algebra.

The root permission object is emitted in this insertion order: unknown-tool `*:
deny`; patterned built-ins `read`, `edit`, `glob`, `grep`, `list`, `bash`,
`external_directory`, `lsp`, `skill`; scalar built-ins `todowrite`, `question`,
`webfetch`, `websearch`, `doom_loop`; derived `task`; then exact custom-tool IDs
sorted lexicographically. `task` is `"*": "deny"` followed by delegation targets in
source order, so delegation and permission cannot drift. Every selected custom
tool must exist in the registry; unknown tools stay denied.

The executable [host adapter](../../spikes/rt-234-opencode-v2/src/host-permission.ts)
accepts an OpenCode global shorthand or exact key-to-shorthand map. A granular
global pattern map for a managed key fails
registration in v1 because OpenCode agent rules otherwise take precedence and
could widen it. The restriction must instead live in the canonical role rule or
a future schema with a proven pattern-partition algorithm. Unsupported host
wildcards also fail. The normative merge is
[`permission-compiler.ts`](../../spikes/rt-234-opencode-v2/src/permission-compiler.ts).

## Deterministic compilation

The compiler is a pure transformation over an explicit registry input:

1. validate the role, shared modules, registries, and typed overlay;
2. normalize strings to NFC/LF/no trailing whitespace; preserve semantic array
   order; require set-like arrays to be unique;
3. resolve enablement and the deny-wins runtime intersection;
4. compose prompt sections in the fixed order;
5. map only supported fields into OpenCode `AgentConfig`;
6. canonicalize provenance inputs and calculate SHA-256 digests;
7. return the agent config plus a separate provenance record.

For the `1.17.5` pin, emitted agent fields are limited to:

```text
description, mode, hidden, prompt, model?, variant?, temperature?, steps?,
permission
```

Structured role semantics enter only through the deterministic `prompt` bytes.
Plugin/hook/skill IDs enter the separate binding record, not `AgentConfig`.
Source locators, checksums, role-class metadata, and provenance remain sidecar
data. Plugin registration uses the typed `config` hook from
`@opencode-ai/plugin`; hooks use the active agent/session identity and remain
guarded to the selected archetype. OpenCode continues to own execution. The official
[plugin contract](https://opencode.ai/docs/plugins/) remains the public anchor.

## Provenance record

The compiler returns a stable sidecar with:

```text
schemaVersion, roleId, roleVersion, roleSourceDigest,
sharedPromptDigests, compilerVersion, opencodeVersion,
pluginSdkVersion, overlayDigest, policyDigest, bindingDigest,
outputDigest, decisionRefs
```

Canonical JSON recursively sorts object keys, preserves semantic array order,
uses UTF-8, and contains no insignificant whitespace or timestamps.

- `roleSourceDigest` covers the fully validated normalized role source.
- `policyDigest` covers authority, escalation, artifacts, verdicts, delegation,
  permissions, requirements, and role security additions.
- `overlayDigest` covers the validated ordered overlays.
- `bindingDigest` covers selected model/variant/temperature/steps, effective
  permissions, and the selected plugin/hook/skill IDs.
- `outputDigest` covers only the emitted OpenCode agent config, including prompt.
- each shared prompt digest covers its normalized module bytes.

The identity record stores the Phase 1 role/policy/binding digests, not compiled
prompt text. [`canonical.ts`](../../spikes/rt-234-opencode-v2/src/canonical.ts)
and [`compiler.ts`](../../spikes/rt-234-opencode-v2/src/compiler.ts) are the
normative canonicalization and digest inputs.

## Compatibility and migration

- The compiler accepts only schema versions it explicitly implements.
- Schema migrations are pure `vN -> vN+1` functions with fixtures for both
  input and output; sources are migrated in Git, never implicitly rewritten at
  runtime.
- Role semantic-version changes follow the identity rules. Major changes need
  explicit state/handoff compatibility review.
- The exact OpenCode CLI and plugin SDK versions are pinned together. Dependency
  drift fails the compatibility check rather than floating silently.
- Exact `@opencode-ai/sdk/v2` `AgentConfig`/`PermissionConfig` types at `1.17.5`
  are the compiler boundary; the plugin adapter hides them from role sources. A
  compile-and-load fixture must pass before upgrading any pin.
- Unknown OpenCode fields are not forwarded. Removed/renamed fields require a
  compiler adapter and regenerated snapshots.
- Rollback restores a prior compiler/shared-policy/role release, then uses the
  Phase 1 authorized lease/CAS control operation to select a compatible identity
  generation. Revoked/archived identities cannot roll back or execute.

## Generated-artifact policy

- Production roles are registered at runtime; `.opencode/agents/` is not a
  second source tree.
- Compiler snapshots, exported JSON Schema, and Markdown previews may be
  generated under test/build output and must carry source/output digests.
- Checked-in fixtures are minimal compatibility evidence and are updated only
  through the compiler plus review.
- Build output, local identity state, sessions, logs, and prompt previews are
  ignored and never imported as role source.
- A generated artifact that differs from its recorded digest fails validation.

## Representative role-class fit

| Role class | Example | Distinguishing schema use | Exceptions needed |
| --- | --- | --- | --- |
| Primary | Cortex | `mode: primary`, bounded permissions, worker delegation, evidence handoff | None |
| Coordinator | Delivery coordinator | two-target allowlist/depth/concurrency and synthesized handoff | None |
| Worker | Focused builder | hidden `subagent`, bounded artifact output, no delegation | None |
| Reviewer | Validator | hidden `subagent`, verdict/evidence contract, no delegation | None |
| Operations | Recovery operator | hidden `subagent`, guarded hook requirement, no delegation | None |

Flux and Zen use the same contract as primary or subagent archetypes; their
differences are declarative responsibilities, artifacts, permissions, selected
plugins/hooks, and prompt additions. Adding a fourth archetype requires one role
object plus registry inclusion, not a schema extension.

The five complete sources are in
[`test/fixtures.ts`](../../spikes/rt-234-opencode-v2/test/fixtures.ts). Their exact
expanded `AgentConfig`, prompt, binding, and provenance records are frozen in the
[`golden snapshot`](../../spikes/rt-234-opencode-v2/test/__snapshots__/compiler.test.ts.snap).
The schema/negative/host-adapter/collision/portability/delegation/ordering/cycle/digest
suite passes all five classes without
an exception; summaries in this table are not used as proof.

## Acceptance invariants

1. One TypeScript role object is the canonical role source.
2. Runtime and compile-time validation derive from one schema.
3. Prompt order cannot vary by role or overlay.
4. Project/user configuration may replace runtime bindings only within policy;
   semantic changes require a versioned source change.
5. The emitted OpenCode object contains supported runtime fields only.
6. Equal normalized inputs and pins produce byte-identical config and digests.
7. Unknown versions, fields, registry IDs, secrets, absolute paths, or permission
   escalation fail before registration.
8. Pattern ordering is authored only in the role source; overlays are key-wide,
   ordered, narrowing-only meets and cannot widen host/repository policy.
9. `policyDigest` and `bindingDigest` satisfy the frozen Phase 1 identity record;
   plugin/hook/skill metadata never leaks into `AgentConfig`.
10. Five executable role fixtures and their golden outputs pass 22 schema,
    determinism, precedence, registry/collision, portability, host-adapter,
    exact-pin, and digest tests with 64 assertions.
