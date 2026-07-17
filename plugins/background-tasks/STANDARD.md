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
contracts, `tools/` owns OpenCode tool adapters, and `shared/` owns small common
utilities. OpenCode remains responsible for sessions and execution.

## Invariants

Task state has one manager owner, tool results are serializable, and plugin
initialization performs no durable writes or external process launch.

## Extension rules

Add behavior to the narrowest existing module. Replace the simple in-memory
manager only through the existing manager interface and without importing a
separate orchestration runtime.

## Validation

The bundle must type-check and initialize independently with its three tools.

## Non-goals

This bundle does not persist agent identity, own OpenCode sessions, or recreate
the removed external background-agent runtime.
