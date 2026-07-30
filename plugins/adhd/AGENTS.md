---
kind: agent-instructions
version: 1
scope: "plugins/adhd/**"
status: active
inherits: "../../AGENTS.md"
applies_to: ["**/*"]
---

# ADHD Agent Policy

## Read first

Read `CONTEXT.md`, `STANDARD.md`, `engine.ts`, and `prompts.ts` before changing a
phase. Read `dispatch.ts` before changing how a branch is opened.

## Operating rules

- Keep every model call behind the injected `BranchDispatch`. The engine never
  reaches a provider and never touches the OpenCode client directly.
- Keep system prompts in `prompts.ts` and owned by the engine. A tool argument
  that sets a system prompt is a defect, not a feature.
- Keep the divergence brief free of sibling output. `buildDivergeBrief` is
  exported so the invariant can be asserted rather than assumed.
- Preserve each phase's failure posture, and state the reason in a comment when
  changing one.
- Keep executable logic flat at the bundle root.

## Change boundaries

Do not add a provider SDK, a second dispatch path, a session store, or a
recursive run. Do not import another bundle — if a sibling appears to have the
utility you want, write the narrow version you actually need here instead. Do not
vendor upstream ADHD source; port the mechanism and keep the provenance note in
`STANDARD.md` and `.agents/index.yaml` accurate.

## Validation

Run root type checking and independent plugin initialization, plus `bun test` for
this bundle. Cover any changed phase with a fake dispatch asserting its brief and
its failure posture.

## Handoff

Name the phases changed, the failure postures affected, and the isolation
assertions that were run.
