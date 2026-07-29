---
kind: repository-standard
version: 1
scope: "plugins/background-tasks/**"
status: active
---

# Background Tasks Standard

## Purpose

Provide bounded OpenCode tools for launching, inspecting, and cancelling
background work while keeping lifecycle state behind one manager contract.

## Boundaries

The entry point composes tools. `features/background-agent/` owns lifecycle
contracts and the manager, `tools/` owns OpenCode tool adapters, and `shared/`
owns small common utilities including `dispatch.ts`, the subagent dispatch
primitive. OpenCode remains responsible for execution, permissions, auth, and the
agent loop; this bundle opens child sessions through the OpenCode client and owns
nothing about how they run.

## Invariants

Task state has one manager owner, tool results are serializable, and plugin
initialization performs no durable writes, network call, or external process
launch. A launched task reports its child session id before `launch` returns, and
a cancelled task is never overwritten by a late completion.

## Extension rules

Add behavior to the narrowest existing module. Replace the manager only through
the existing manager interface and without importing a separate orchestration
runtime. `shared/dispatch.ts` is bundle-private: another bundle needing session
dispatch writes its own against the OpenCode client rather than importing this
one.

## Validation

The bundle must type-check and initialize independently with its three tools.
Lifecycle transitions and the dispatch primitive are asserted against a fake
OpenCode client, not a live server.

## Non-goals

This bundle does not persist agent identity, own the agent loop or execution, or
recreate the removed external background-agent runtime. It does not own the
*policy* of a session — only the lifecycle record of a task it launched.

## Amendment — session ownership

The previous non-goal read "does not own OpenCode sessions", written when the
manager was a no-op record store and nothing here opened a session. Implementing
real dispatch made that statement false rather than protective: the tools
promised background execution that could not happen. The constraint is narrowed,
not dropped — the bundle opens child sessions and tracks their task state, and
still owns no part of execution, permissions, auth, or the agent loop.
