---
kind: repository-standard
version: 1
scope: "**/*"
status: active
---

# just-oc Repository Standard

## Purpose

This repository owns a compact collection of OpenCode plugin bundles and the
project configuration needed to load them. It exists to extend OpenCode through
its supported plugin surface, not to replace the OpenCode runtime.

## Boundaries

- `plugins/` is the only maintained implementation root.
- `.opencode/plugins/` contains autoloaded re-export loaders.
- `.opencode/opencode.json` contains project configuration without credentials or absolute paths.
- `.agents/index.yaml` indexes external source references for OpenSrc and DeepWiki.
- `kilo.jsonc` is the sole Kilo-specific tracked configuration.

The maintained direction is three independent bundles: Background Tasks,
Zellij, and Agent Archetype System. Each bundle owns its entry point and local
implementation modules.

## Runtime topology

OpenCode runs one central server process per machine. That process owns the
machine's filesystem access, provider authentication, project instances, and
all session execution. A local TUI, Desktop client, or Web client attaches to
that server; it must not create a replacement server for ordinary project work.

The selected project directory is interpreted on the server host. A client
attaches with `--dir <server-host-path>` so OpenCode resolves that project's
configuration, agents, skills, plugins, and permissions on the machine that
actually hosts the checkout. A client-side path is valid only when the server
can access the same path.

Coding sandboxes follow the same rule: each sandbox hosts `opencode serve` for
its own checkout and does not need to host a Web frontend. A local control
machine may attach directly to each sandbox server over the Tailnet. A central
aggregated frontend may expose a single DNS endpoint and route to those server
instances, but this is a client/control-plane concern, not a plugin runtime.
OpenCode's multi-workspace aggregation path is experimental; do not model it as
transparent server federation or persist Tailnet endpoints, DNS names,
credentials, or proxy configuration in this repository.

For networked servers, use Tailnet ACLs and OpenCode server authentication.
Bind each process only to its intended interface. Keep the server URL and any
credential in user or deployment configuration, never in project configuration.

## Project catalogue boundary

OpenCode's home project list contains projects that its server has already
resolved or that the user has opened; it does not scan arbitrary local
repositories. The supported plugin API has no global project-catalogue,
filesystem-root discovery, or home-list mutation hook. Do not add a plugin that
scrapes internal OpenCode storage or simulates project registration. If project
catalogue seeding is needed, keep it as explicit client/deployment automation
outside this repository and treat its API use as version-sensitive.

### Wishlist: automatic Git project surfacing

Attaching a CLI or starting a run with `--dir <server-host-path>` should make an
existing Git project visible in every Web or Desktop client attached to that
server without requiring the user to choose **Add project**. The intended flow
is:

1. OpenCode resolves the requested directory to its canonical Git worktree and
   project identity, using a normalized remote origin when one exists.
2. The attached client adds that canonical worktree to its opened-project list,
   deduplicated within the active server scope.
3. Existing and newly created sessions for the worktree and its registered
   sandboxes become visible immediately.

This is project surfacing, not repository discovery or `git init`: it must not
scan filesystem roots, create repositories, or expose unrelated projects. The
acceptance case is that a session created with
`opencode attach <server-url> --dir <git-worktree>` or
`opencode run --attach <server-url> --dir <git-worktree> ...` appears in the
attached frontend without a manual catalogue action.

Implement this as a plugin only after OpenCode exposes a supported client-side
project-open hook or an equivalent server event that clients are required to
apply to their opened-project state. Until then, treat it as an upstream client
capability gap; do not write browser persistence, private OpenCode storage, or
synthetic catalogue records from a server plugin.

## Documentation ownership

TypeScript and configuration define behavior. Bundle `STANDARD.md` files explain
why a boundary exists; bundle `AGENTS.md` files govern edits. Linear owns issue
scope, execution evidence, and migration history.

## Invariants

- OpenCode owns the agent loop, sessions, permissions, authentication, and tool execution.
- Plugin loaders contain no behavior beyond re-exporting a bundle entry point.
- Credentials and hard-coded machine paths never enter tracked files.
- One Bun lockfile describes the TypeScript dependency graph.
- Bundles compile and initialize independently.

## Extension rules

Create a new bundle only for cohesive behavior with an independent OpenCode
entry point. Give every meaningful bundle a `STANDARD.md` and `AGENTS.md` pair.
Prefer declarative configuration and small transforms over parallel runtimes.

## Validation

Type checking, independent plugin initialization, and project-loader imports are
mandatory. Provider live-response checks are useful evidence but are not a
substitute for deterministic load validation.

## Non-goals

This repository does not own general agents, skills, research archives,
deployment infrastructure, Python applications, generated telemetry, test
archives, speculative spikes, or external submodules.
