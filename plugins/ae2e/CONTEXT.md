---
kind: checkpoint-context
version: 1
scope: "plugins/ae2e/**"
status: active
---

# AE2E Bundle Context

## Past

AE2E was first imagined as a loop that owns its own execution: watch the issue
graph, notice when children finish, and prompt the session again. Every version
of that shape ends as a second host runtime inside a plugin — it needs a Linear
credential in the sandbox, it dies with the container it polls from, and it
becomes a second writer to a lifecycle the control plane already owns.

AES-26 settled the other direction: a runtime-policy layer that cooperates with
OpenCode's session ownership, receives generation-stamped lifecycle envelopes,
and publishes state back. It also recorded a correction worth keeping visible —
an earlier draft let a turn ending resume the session, which is an infinite loop
written as a state diagram, because the resumed turn ends too.

## Present

This bundle is the park-and-resume spine of that decision. A session becomes
AE2E only when a control-plane kickoff envelope arrives; until then the bundle
registers no tool, alters no prompt, and injects no turn, so a session cannot
tell it is loaded.

Parking is the absence of work rather than a kind of work. OpenCode's
`promptAsync` already accepts `noReply`, so the coordinator can put a message in
front of a session without starting a turn, and the session stays genuinely
idle — no held turn, no timer, no poll. Resumption is a new turn carrying the
envelope's context, and it is reachable only from `resume_requested`, which only
a lifecycle envelope at an unseen generation can produce.

Scoping is load-bearing because the only turn-boundary signal OpenCode gives a
plugin is `session.idle` on the server-wide `event` hook. Idle from a subagent,
a background task, or an unrelated conversation reaches this bundle and must
change nothing. A per-session instance keyed by session id is what makes that
true, and a turn latch driven by the host's busy signal is what makes detection
exactly-once rather than once-per-signal.

The core is a pure fold with no import of any host type, so the whole state
machine can be driven in a test without a server. The coordinator is stood in
for by a fake here; the real `linear-toolkit` control plane is a separate
repository and a separate ticket.

One runtime constraint was found by running this against a live OpenCode 1.17.5
server rather than by reading the types, and it shapes how a coordinator should
behave. `noReply` is honoured only on a session that is already idle. A message
injected while a turn is open is queued, and the host drains it as a full turn
of its own once the current turn ends — the flag is not carried through the
queue. A coordinator has to park mid-turn, because a turn ending in `active` is
a stall by design, so that drain turn is unavoidable in the park path. It is
harmless: it ends inside `waiting_on_children`, where a turn ending is already a
no-op, so the run stays parked and is neither resumed nor escalated. The
sequence is pinned by a test rather than left to be rediscovered. Once the drain
turn finishes the session is genuinely idle, and stays idle with no held turn,
no timer, and no poll until an envelope arrives.

## Future

The advisor conversation and its containment, and cold-start reconstruction on
replacement compute, are the two declared follow-ons. Both build on the ports
established here rather than widening the core: the advisor arrives as a third
port, and recovery arrives as `readTranscript` plus a coordinator state
readback, because the event log is already the only state there is.

Keep the boundary where AES-26 put it. The policy never writes Linear, never
holds a credential, and never treats a turn ending as permission to continue.
