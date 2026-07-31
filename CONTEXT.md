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

An early sandbox image graph lived under `sandbox/`. [AES-21](https://linear.app/rt88/issue/AES-21/publish-the-canonical-aes-sandbox-from-agent-toolkit-to-ghcr)
moved the canonical development and runtime image graph to Agent Toolkit after
establishing that image composition did not belong with OpenCode plugin
behavior.

## Present

The repository owns tracked OpenCode and MCP configuration plus five independent
runtime-plugin bundles under `plugins/`: Background Tasks, Zellij, Command Run,
Agent Archetype System, and ADHD. Project loaders under `.opencode/plugins/`
make those bundles available to OpenCode without replacing OpenCode's runtime.
`Justfile` provides the explicit `just oc install` path for local dependencies
and global OpenCode wrappers.

Agent Toolkit owns the canonical sandbox image graph and consumes an exact
pinned `just-oc` revision as a separate source context. That relationship makes
this repository an input to the sandbox build, not the owner of its build,
publication, deployment, host lifecycle, or runtime operation.

Background Tasks and ADHD both open child sessions, and both do so through the
OpenCode client rather than through each other. Their dispatch code is
deliberately not shared: Background Tasks must return a session id before the
work finishes, while ADHD must await a whole phase before starting the next, and
one primitive serving both contracts is wider than either needs.

## Future

The intended direction keeps configuration and runtime plugins on supported
OpenCode hooks with a stable, pin-able source contract for external consumers.
This repository is not intended to regain sandbox composition, publication,
deployment, host operation, or ingress responsibilities, and it is not intended
to become a replacement agent runtime, project catalogue, or home for copied
skills and generated state. A future upstream project-catalogue capability
would fit here only through a documented supported client or server extension
point.
