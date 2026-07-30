---
kind: checkpoint-context
version: 1
scope: "plugins/adhd/**"
status: active
---

# ADHD Bundle Context

## Past

Flux's role contract was deliberately written to invoke ADHD as an instrument,
but the upstream skill asked the invoking agent to simulate branch isolation and
the upstream CLI opened a separate provider inference path. Neither surface
could provide host-owned isolation inside OpenCode.

## Present

This bundle ports the divergent-ideation mechanism onto supported OpenCode
session APIs. Each generator branch receives the problem, caller context, and a
single cognitive frame in its own child session. Scoring, clustering, and
deepening begin only after divergence finishes, and retain the caller context so
hard constraints remain visible during convergence. The tool owns the one-level
fan-out ceiling and returns the structured result Flux expects.

The bundle remains independent from Background Tasks even though both dispatch
child sessions. ADHD awaits complete phases; Background Tasks must return a
session identifier before its prompt completes. Sharing a dispatch abstraction
would widen both contracts without reducing their runtime responsibilities.

## Future

Keep provider selection, authentication, permissions, execution, and the agent
loop owned by OpenCode. Extend the phase loop only when the structured contract
and failure posture can be tested deterministically, and preserve structural
branch isolation as the load-bearing constraint.
