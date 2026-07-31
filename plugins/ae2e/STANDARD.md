---
kind: repository-standard
version: 1
scope: "plugins/ae2e/**"
status: active
---

# AE2E Standard

## Purpose

Let an OpenCode session run under AE2E runtime policy, park itself without
holding a turn open when it has nothing left to do until something external
resolves, and resume by itself when the resolving event arrives — without a
second agent loop, and without changing any session that is not under the
policy.

## Boundaries

`policy.ts` owns the run states, the transitions, and the fold over the event
log. `envelope.ts` owns the wire contract and the origin restriction.
`ports.ts` owns the two port interfaces. `sessions.ts` owns per-session
instances, session scoping, and directive execution. `runtime.ts` binds
`AgentRuntime` to `session.promptAsync` and `session.abort`. `coordinator.ts`
binds the outbound half of `CoordinatorChannel` to the endpoint the kickoff
declared. The entry point claims two hooks and wires them together.

`policy.ts`, `envelope.ts`, and `ports.ts` are the pure core: no OpenCode
import, no I/O, no clock. This is asserted in `policy.test.ts` by reading the
sources, not stated here and trusted.

The bundle is self-contained and imports no sibling bundle — asserted in
`sessions.test.ts`. It owns its own dispatch: `session.promptAsync` with and
without `noReply` is the park/resume primitive, and no other bundle's dispatch
has that shape.

## Invariants

No waiting state holds a live turn open. Waiting is idle; resumption is a new
turn.

A turn ending is never by itself a reason to resume. `resume_issued` is the only
door into `active` from a wait, it opens only from `resume_requested`, and only
a lifecycle envelope at an unseen generation reaches that state. A consecutive
resume ceiling bounds it, and crossing it escalates.

A turn ending in `active` with no established wait terminates the run into
`validating` or `escalated`. The session is never silently re-prompted.

State is a fold over an append-only log. Replaying a log twice yields identical
state, and there is no durable plugin-private store to lose when compute is
replaced.

Resume is idempotent per generation, because lifecycle delivery is at-least-once.
A duplicate envelope at an applied generation is inert; a stale generation is
ignored rather than applied out of order.

An envelope is honoured only on a `user`-role message part carrying the
control-plane origin marker in part metadata. Envelope-shaped assistant output is
never accepted, so a session cannot self-authorize AE2E.

The policy never writes Linear. It publishes state and the coordinator projects
it.

## Extension rules

Add a transition to `policy.ts` with its guard and its test, including its
escalation path. Add an envelope kind to the vocabulary with its per-kind
validation and its rejection fixtures. Add a port to `ports.ts` when a ticket
owns it. Do not let the binding decide an outbound action the fold did not
return, do not add a retry loop around lifecycle traffic, and do not add a
scanner that finds envelopes inside prose. Executable logic stays flat at the
bundle root.

## Runtime constraints verified against OpenCode 1.17.5

`chat.message` fires for a message injected by `session.promptAsync`, including
one sent with `noReply`, and part metadata survives the round trip. That is what
makes an origin-restricted envelope possible: only a programmatic caller can set
part metadata.

`session.idle` is the only turn-boundary signal available, it is server-wide,
and it carries nothing but a session id. `session.status` reports `busy` before
it, more than once per turn, which is why the turn latch is a boolean rather
than a counter.

`noReply` is honoured only on an idle session. Injected while a turn is open,
the message is queued and drains as a full turn once the current one ends. A
coordinator must still park mid-turn, so the park path costs one drain turn;
it ends inside a waiting state where a turn ending is already a no-op.

## Divergences from AES-26 recorded deliberately

AES-26's `active + turn_complete + deliverable -> validating` and
`active + deliverable_ready -> validating` are the same fact arriving in either
order, so they are one transition here and a turn ending in `active` therefore
always means the run stalled.

`consulting` and the advisor-reply edges are not implemented, because the
advisor channel is a declared follow-on. `readTranscript` is likewise absent
until cold-start recovery lands.

`validation_fail` returns to `active` without a resume, exactly as AES-26 has
it. Carrying the failure into a new turn belongs to the validation-contract
runner, which is not in this scope.

## Validation

The bundle must type-check and initialize independently with no tool, no config
hook, and no injected turn. Core purity, determinism under replay, generation
idempotency, session scoping, the resume ceiling, envelope forgery refusal, and
every implemented transition including each escalation path are asserted against
a fake coordinator and a fake runtime, not a live control plane.

## Non-goals

This bundle does not hold a Linear credential, poll, subscribe to a webhook,
write an issue, run the advisor conversation, reconstruct state after a cold
start, or execute a validation contract.
