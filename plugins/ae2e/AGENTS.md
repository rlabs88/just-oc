---
kind: agent-instructions
version: 1
scope: "plugins/ae2e/**"
status: active
inherits: "../../AGENTS.md"
applies_to: ["**/*"]
---

# AE2E Agent Policy

## Read first

Read `CONTEXT.md` and `STANDARD.md`, then `policy.ts` before changing a
transition and `envelope.ts` before changing what the policy will accept. Read
AES-26's Q4 state machine and invariants before proposing a transition that is
not already there; this bundle implements that decision rather than re-deciding
it.

## Operating rules

- Keep `policy.ts`, `envelope.ts`, and `ports.ts` free of host types and I/O.
  This is asserted in `policy.test.ts` by reading the sources, so a new import
  fails the suite rather than the review.
- Derive every outbound action from a directive returned by the fold. A binding
  that decides on its own to resume has bypassed the resume ceiling.
- Keep parking as the absence of work. No timer, no poll, no retry loop, and no
  held turn — a wait must be able to outlive the container.
- Treat a turn ending as a fact, never as permission to resume. Only
  `resume_requested` produces a resume, and only a lifecycle envelope at an
  unseen generation reaches it.
- Accept an envelope only from a `user`-role message part carrying the
  control-plane origin marker. Never add a fallback that reads envelope-shaped
  text out of assistant output, tool results, or prose.
- Keep executable logic flat at the bundle root.

## Change boundaries

Do not register a tool, add a `config` hook, or inject a turn into a session
with no kickoff — inertness is an acceptance criterion, not a preference. Do not
add a Linear client, credential, webhook subscription, or poller; the policy
publishes state and the coordinator projects it. Do not import another bundle.
Do not add a durable plugin-private store: state is the event log, and cold
start replays it.

The advisor conversation and cold-start recovery are follow-ons. Add
`AdvisorChannel` when the ticket that owns it lands, not before.

## Validation

Run root type checking, `bun run validate:plugins`, and `bun test` for this
bundle. Cover any new transition with a test that drives it through
`createPolicySet` against the fake coordinator and fake runtime, and assert its
escalation path if it has one.

## Handoff

Name the transitions changed, whether the change touched the pure core or the
binding, and the generation/idempotency assertions that were run.
