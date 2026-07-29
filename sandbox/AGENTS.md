---
kind: agent-instructions
version: 1
scope: "sandbox/**/*"
status: active
inherits: ../../AGENTS.md
applies_to: ["sandbox/**/*"]
---

# Sandbox Image Policy

`sandbox/` owns source-controlled image composition only: the shared runtime
base, named agent configurations, compatibility probes, and image-local startup
behavior.

- Keep shared operating-system and pinned OpenCode installation logic in the
  `base` stage of `Dockerfile`.
- Named environments layer on the shared base and must not duplicate it.
- Preserve the Linear Toolkit gateway ABI: bash, git, base64, sha256sum, find,
  xargs, `/usr/local/bin/sandbox-entrypoint`, `/var/lib/opencode`, `/workspace`,
  port 4096, and compatibility with a gateway-supplied entrypoint override.
- Keep compatibility checks read-only until they have accepted retained state.
- Accept secrets only at container runtime. Never add credential build args,
  copy secret files, or print secret-bearing repository URLs.
- OCIR login, publication, provenance records, caching, and rollback are owned
  by Homelab Toolkit.

Run `bun test` and `bun run validate:sandbox` after changes in this boundary.
