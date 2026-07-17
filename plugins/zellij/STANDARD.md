---
kind: repository-standard
version: 1
scope: "plugins/zellij/**"
status: active
---

# Zellij Standard

## Purpose

Expose Zellij discovery and control as one OpenCode tool with domain-specific
command builders and normalized execution results.

## Boundaries

`domains/` owns Zellij concepts, `exec.ts` owns process execution, `tool.ts`
owns the OpenCode adapter, and `types.ts` owns shared contracts. The entry point
only registers the tool.

## Invariants

Domain handlers validate input before execution, commands remain explicit, and
results preserve enough stdout/stderr context to diagnose failure.

## Extension rules

Add new Zellij capabilities as focused domain handlers and route them through
the existing tool contract. Do not create a second execution layer.

## Validation

The bundle must type-check and initialize without requiring a live Zellij
session. Live command checks are supplemental.

## Non-goals

This bundle is not a terminal multiplexer runtime, session database, or copy of
the removed Zellij MCP submodule.
