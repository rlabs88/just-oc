# RT-234 Architecture Record

This directory is the durable design record for
[RT-234](https://linear.app/rt88/issue/RT-234/scope-and-redesign-just-oc-as-the-opencode-v2-persistent-agent-harness).
It scopes the second-generation `just-oc` harness. It is not the production
implementation of the rewrite.

## Artifacts

- [Baseline and disposition](baseline-and-disposition.md) records the pinned
  repository state, security containment, compatibility target, portability
  defects, and the disposition of every top-level surface.
- `persistent-agent-identity.md` owns the identity and state model.
- `role-prompt-contract.md` owns the canonical role schema and deterministic
  rendering contract.
- `prompt-reference-index.md` records the OpenSrc-indexed Codex and Claude Code
  comparative sources, content hashes, licenses, and synthesis boundary.
- `repository-plugin-architecture.md` owns the selected package/plugin
  boundaries and migration decision.
- [Compatibility spike](compatibility-spike.md) owns the executable RED/GREEN,
  exact OpenCode load, persistence/recovery, lifecycle, and limitation evidence.

## Authority

The RT-234 issue and its accepted decision thread own scope. This directory
captures stable design evidence. Production cleanup belongs to
[RT-235](https://linear.app/rt88/issue/RT-235/reorganize-just-oc-and-preserve-legacy-configuration),
and the Agent Archetypes implementation belongs to
[RT-236](https://linear.app/rt88/issue/RT-236/implement-agent-archetypes-plugin-for-cortex-flux-and-zen).
