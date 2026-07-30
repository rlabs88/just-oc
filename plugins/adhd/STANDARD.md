---
kind: repository-standard
version: 1
scope: "plugins/adhd/**"
status: active
---

# ADHD Standard

## Purpose

Run the ADHD divergent-ideation method inside OpenCode as one tool, dispatching
each branch as an isolated OpenCode subagent session rather than opening a second
inference path.

## Boundaries

`frames.ts` owns the vantage library, `prompts.ts` owns the phase system prompts,
`parse.ts` owns structured-output validation, `limit.ts` owns concurrency,
`dispatch.ts` owns subagent dispatch against the OpenCode client, `engine.ts`
owns the phase loop, and `tool.ts` owns the OpenCode adapter and the fan-out
ceiling. The entry point only registers the tool.

The bundle is self-contained and imports no sibling bundle — asserted in
`tool.test.ts`, not merely stated. `engine.ts` reaches the client only through an
injected `BranchDispatch`, so the phase logic stays testable without a server and
independent of how a branch is opened.

## Invariants

Branch isolation is structural: a divergence brief carries the problem, the
caller's context, and one frame, and never a sibling branch's output. Generation
and evaluation run as separate dispatches under separate system prompts. The
engine owns every system prompt — a caller supplies a problem and tunables only.
Scoring fails closed; reframe, clustering, and per-branch divergence fail open.
Fan-out is capped at one level.

## Extension rules

Add a vantage to `FRAMES` with its tags, or a phase to the engine loop with its
own system prompt and parse contract. Do not let a caller inject a system prompt,
and do not thread one branch's output into another branch's divergence brief.
Executable logic stays flat at the bundle root.

## Validation

The bundle must type-check and initialize independently with its one tool.
Isolation, phase separation, structured-output validation, failure paths, and the
fan-out refusal are asserted against a fake dispatch, not a live provider.

## Non-goals

This bundle does not call a model provider directly, own sessions or task
lifecycle, vendor upstream ADHD source, or install the upstream skill or CLI.

## Provenance

The method, the frame set and its `wild` classification, the phase system
prompts, the scoring weights, and the `RunResult` shape are ported from
[`UditAkhourii/adhd`](https://github.com/UditAkhourii/adhd) under the MIT licence.
See `.agents/index.yaml` `osrc` for the recorded source entry.
