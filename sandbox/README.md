# Cortex sandbox image

`Dockerfile` contains the reusable Fedora `base` stage and the named `cortex`
target layered on it. `toolchain.lock.json` is the immutable baseline manifest:
it pins the Fedora image digest, brew/core and dotfiles revisions, Homebrew
membership and versions, agent CLIs, the Mason registry revision and package
artifacts, compatibility schemas, and size budgets. The release platform is
`linux/amd64`.

The sandbox dotfiles overlay keeps the pinned shell/editor configuration but
disables zmx and Molten, which are outside the non-GUI headless contract. Mason
uses only the baked file-backed registry, and every required language tool is
installed at its manifest version during the image build.

Build and exercise the full image contract from an exact, clean dotfiles
checkout:

```bash
DOTFILES_CHECKOUT=/path/to/dotfiles bun run validate:sandbox
```

The named image declares compatibility version `2`, OpenCode-state schema `1`,
workspace-checkpoint schema `1`, and provisioning schema
`cortex.provisioning/v1`. Its gateway contract is:

- `/usr/local/bin/sandbox-entrypoint`
- `/var/lib/opencode` for retained OpenCode state and compatibility metadata
- `/workspace` for the retained repository workspace
- port `4096`, including `GET /api/health`

Legacy gateways may invoke the entrypoint without arguments and supply one
`SANDBOX_REPO_URL`. Descriptor-aware gateways invoke:

```bash
/usr/local/bin/sandbox-entrypoint serve \
  --provisioning-file /run/cortex/provisioning.v1.json
```

The descriptor provisions an ordered repository set below `/workspace/repos`
and the OpenCode server starts in its declared primary repository. See
`cortex/provisioning.md` for the closed schema and transactional behavior.

Repository and model credentials are runtime-only inputs. OCIR publication and
its immutable provenance record are intentionally owned by Homelab Toolkit.
