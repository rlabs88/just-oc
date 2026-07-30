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

The repository owns five independent plugin bundles under `plugins/`: Background
Tasks, Zellij, Command Run, Agent Archetype System, and ADHD. It also owns the
maintained `sandbox/` image-source boundary: one shared runtime base and named
agent environments layered on it. Project loaders under `.opencode/plugins/`
make those bundles available to OpenCode without replacing OpenCode's runtime.
`Justfile` provides the explicit `just oc install` path for local dependencies
and global OpenCode wrappers.

Background Tasks and ADHD both open child sessions, and both do so through the
OpenCode client rather than through each other. Their dispatch code is
deliberately not shared: Background Tasks must return a session id before the
work finishes, while ADHD must await a whole phase before starting the next, and
one primitive serving both contracts is wider than either needs.

## Future

Keep extensions on supported OpenCode hooks and keep global installation and
sandbox images reproducible from this checkout. Homelab Toolkit remains the
owner of OCIR publication, credentials, hosts, caching, ingress, and runtime
configuration. Do not turn this repository into a replacement agent runtime, a
project catalogue, or a home for copied skills and generated state. Any future
upstream project-catalogue capability should be adopted only through a
documented supported client or server extension point.
