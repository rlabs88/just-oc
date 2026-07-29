# Cortex sandbox image

`Dockerfile` contains the reusable Fedora `base` stage and the named `cortex`
target layered on it. `toolchain.lock.json` is the immutable baseline manifest:
it pins the Fedora image digest, brew/core and dotfiles revisions, Homebrew
membership and versions, the full npm dependency graph for agent CLIs, the Mason registry revision and package
artifacts, compatibility schemas, and size budgets. The release platform is
`linux/arm64`; both the build and the running sandbox reject any other
architecture.

Local builds fail before dependency resolution unless `uname -m`, the Docker
server architecture, and the bootstrapped Buildx platform set all prove a
native ARM64 path. An x86 host, x86 Docker daemon, or builder without
`linux/arm64` support is rejected rather than routed through emulation.

The sandbox copies only the pinned shell loaders, shell utilities, and Neovim
configuration; unrelated private `.config` content never enters the build. The
allowlisted files are scanned for credential-shaped material before use. The overlay
disables zmx and Molten, which are outside the non-GUI headless contract. Mason
uses only the baked file-backed registry, and every required language tool is
installed at its manifest version during the image build. The pinned Mason
registry has no Linux ARM64 `clangd` artifact, so the image exposes the
ARM-native, checksum-locked Homebrew `llvm` bottle's `clangd` through the Mason
binary path and records that adapter explicitly.

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
Credentialed publication is manual-only from the protected default branch and
requires the AES-6 human landing/approval checkpoint.

The Fedora repository is not backed by a stable historical snapshot, so the
RPM dependency graph is not claimed to be byte-reproducible. Each image instead
records a sorted installed-RPM inventory and its digest in
`/etc/cortex-sandbox`; publication provenance captures that digest. Fedora's
OCI index and exact `linux/arm64` child manifest, Homebrew bottles, npm lockfile,
and Mason inputs are pinned and verified fail closed.
