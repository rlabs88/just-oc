# just-oc Standard

`just-oc` is being redesigned as a small, independently versioned OpenCode agent
harness. The current tree is a legacy baseline; the selected target is a private
Bun workspace of independent OpenCode plugin bundles.

The architectural source is the
[RT-234 record](docs/rt-234/README.md), especially:

- [persistent agent identity](docs/rt-234/persistent-agent-identity.md);
- [role and prompt contract](docs/rt-234/role-prompt-contract.md); and
- [repository/plugin architecture](docs/rt-234/repository-plugin-architecture.md).

Core rationale:

1. OpenCode owns sessions, execution, tools, permissions, and the agent loop.
2. Agent Archetypes owns declarative Cortex, Flux, and Zen role composition.
3. Mutable identity/instance/checkpoint state has a separate continuity owner.
4. Useful plugins remain independent bundles with explicit entry points and
   lifecycle tests.
5. Secrets and generated/runtime state are never source.
6. Migration is a sequence of reversible gates, beginning with the RT-235
   archival branch and cleanup before RT-236 implementation.

This file records why the target exists. Operational policy belongs in
`AGENTS.md`; production plugin-local rules belong only at evidenced checkpoints.

