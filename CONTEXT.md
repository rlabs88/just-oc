---
kind: checkpoint-context
version: 1
scope: "**/*"
status: active
---

# just-oc Repository Context

## Past

This repository began with a root `STANDARD.md` describing the supported
OpenCode plugin boundary and a short root agent guide. The policy is now
maintained in `AGENTS.md`; this file preserves the boundary's orientation
without duplicating imperative rules.

## Present

The repository owns four independent plugin bundles under `plugins/`:
Background Tasks, Zellij, Command Run, and Agent Archetype System. It also owns
the maintained `sandbox/` image-source boundary: one shared runtime base and
named agent environments layered on it. Project loaders under
`.opencode/plugins/` make those bundles available to OpenCode
without replacing OpenCode's runtime. `Justfile` provides the explicit
`just oc install` path for local dependencies and global OpenCode wrappers.

## Future

Keep extensions on supported OpenCode hooks and keep global installation and
sandbox images reproducible from this checkout. Homelab Toolkit remains the
owner of OCIR publication, credentials, hosts, caching, ingress, and runtime
configuration. Do not turn this repository into a replacement agent runtime, a
project catalogue, or a home for copied skills and generated state. Any future
upstream project-catalogue capability should be adopted only through a
documented supported client or server extension point.
