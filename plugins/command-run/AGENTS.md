---
kind: agent-instructions
version: 1
scope: "plugins/command-run/**/*"
status: active
inherits: ../../AGENTS.md
applies_to: ["plugins/command-run/**/*"]
---

# Command Run Bundle Policy

- Preserve the strict 1–20 command schema and core command allowlist.
- Preserve the primitive child-command inventory used by stock generic TUI and
  GUI tool rows; do not represent it as runtime authority.
- Keep permission checks per constituent command and use dedicated keys.
- Treat path containment, symlink containment, cancellation, deterministic
  ordering, mutation exclusivity, and output bounds as correctness requirements.
- Keep progress in tool metadata and make legacy TUI notification failures inert.
- Do not add native-tool dispatch, persistent state, provider logic, or agent-loop
  behavior.
- Validate parser, scheduler, adapters, permissions, and loader initialization
  with deterministic ignored smoke coverage before handoff.
