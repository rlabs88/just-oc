# just-oc Agent Policy

Read `STANDARD.md` and the linked RT-234 architecture record before changing
repository structure, agent roles, plugin boundaries, or persistence behavior.

Until RT-235 merges, treat the current tree as a legacy baseline:

- preserve the exact baseline through `legacy/pre-agent-archetypes` before
  cleanup;
- do not migrate the old agent trees into new role sources by default;
- keep pre-existing case-collision modifications and unrelated user work intact;
- never restore or print the historical provider credential;
- use environment/secret-manager injection and keep runtime state out of Git.

For the selected target:

- Bun is the single package manager;
- each retained plugin owns its folder, entry point, state, and lifecycle tests;
- Agent Archetypes uses only `prompts/` and `roles/` as configuration
  subfolders, with executable logic flat at its root;
- tools remain owned by the independent plugins that provide them;
- OpenCode owns sessions, execution, permissions, and the agent loop;
- typed role sources are canonical; generated OpenCode agents are not edited;
- add nested `STANDARD.md` or `AGENTS.md` only when inherited guidance is
  insufficient for a substantial boundary.

RT-235 owns cleanup. RT-236 owns Agent Archetypes. Do not implement later gates
on the legacy tree or bypass their validation/rollback boundaries.
