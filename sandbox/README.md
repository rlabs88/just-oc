# Cortex sandbox image

`Dockerfile` contains the reusable `base` stage and the named `cortex` target
layered on it. The release platform is pinned to `linux/amd64`. Build and
exercise the full image contract:

```bash
bun run validate:sandbox
```

The named image declares compatibility version `1`, OpenCode-state schema `1`,
and workspace-checkpoint schema `1`. Its gateway contract is:

- `/usr/local/bin/sandbox-entrypoint`
- `/var/lib/opencode` for retained OpenCode state and compatibility metadata
- `/workspace` for the retained repository workspace
- port `4096`, including `GET /api/health`

Repository and model credentials are runtime-only inputs. OCIR publication and
its immutable provenance record are intentionally owned by Homelab Toolkit.
