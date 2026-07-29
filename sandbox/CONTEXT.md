---
kind: checkpoint-context
version: 1
scope: "sandbox/**/*"
status: active
---

# Sandbox Image Context

## Past

The deployed sandbox gateway used a locally named image whose source and
compatibility contract did not live in this repository.

## Present

The shared ARM64 Fedora base is described by one immutable toolchain manifest and
contains the pinned headless Linuxbrew, dotfiles, editor, agent CLI, and runtime
graph required by the gateway and maintained plugins. The named `cortex` image
layers the current just-oc plugins and configuration on that base, declares
state, workspace, and repository-provisioning compatibility, and exposes the
gateway-compatible entrypoint. Fresh volumes are initialized only after a
read-only compatibility probe; retained volumes fail closed on absent,
malformed, or unsupported metadata. The entrypoint accepts a closed v1
repository descriptor while retaining the legacy single-repository ABI.

## Future

Additional named environments may layer on the base when they represent a real
agent-environment contract. They publish independently. Do not move routing,
catalog discovery, registry credentials, host cache policy, or ingress here.
