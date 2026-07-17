# just-oc

`just-oc` is a small TypeScript repository for project-local OpenCode plugins.
OpenCode owns the agent loop, sessions, tools, permissions, authentication, and
model execution. This repository contributes bounded plugin behavior through
three ownership bundles:

- `plugins/background-tasks/` — background task tools and lifecycle state.
- `plugins/zellij/` — Zellij discovery and control tools.
- `plugins/agent-archetype-system/` — Cortex, Flux, and Zen prompt/agent transforms (introduced by RT-236).

## Install

Install Bun, authenticate OpenCode with the OpenAI OAuth flow associated with a
ChatGPT subscription, then run:

```bash
bun install
bun run check
opencode
```

The project config selects `openai/gpt-5.6-luna`. No provider credential is
stored in this repository.

## Plugin loading

Source implementations live under `plugins/`. Thin files in
`.opencode/plugins/` re-export each entry point because OpenCode automatically
loads project plugins from that directory. The config does not contain local
machine paths or redundant `file://` plugin entries.

## Development

Read the nearest `STANDARD.md` and `AGENTS.md` before editing a bundle. Keep
runtime behavior in TypeScript, durable rationale in `STANDARD.md`, and issue
execution evidence in Linear. Validate with:

```bash
bun install --frozen-lockfile
bun run check
```

`kilo.jsonc` is the only tracked Kilo-specific configuration. See `LICENSE` for
repository licensing.
