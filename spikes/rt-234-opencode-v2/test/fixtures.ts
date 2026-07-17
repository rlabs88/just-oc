import type {
  CompilerInputV1,
  RoleSourceV1,
} from "../src/role-schema.ts"
import { sharedPrompts } from "../src/shared-prompts/index.ts"
import { allowTarget, makeRole } from "./fixture-role.ts"

export const representativeRoles = [
  makeRole("cortex", "primary", "primary", [allowTarget("focused-builder")]),
  makeRole("delivery-coordinator", "coordinator", "primary", [
    allowTarget("focused-builder"),
    allowTarget("validator"),
  ]),
  makeRole("focused-builder", "worker", "subagent", []),
  makeRole("validator", "reviewer", "subagent", []),
  makeRole("recovery-operator", "operations", "subagent", []),
] satisfies readonly RoleSourceV1[]

export const compilerInput = {
  schemaVersion: 1,
  role: representativeRoles[0]!,
  sharedPrompts,
  registry: {
    roles: representativeRoles,
    occupiedAgentIds: [
      "build", "plan", "general", "explore", "scout",
      "compaction", "title", "summary",
    ],
    modelIds: ["openai/gpt-5.6-luna"],
    pluginIds: [],
    hookIds: ["audit", "checkpoint"],
    skillIds: [],
    customToolIds: [],
  },
  overlays: [],
  pins: {
    compilerVersion: "0.0.0-spike",
    opencodeVersion: "1.17.5",
    pluginSdkVersion: "1.17.5",
  },
} satisfies CompilerInputV1
