import type { Hooks } from "@opencode-ai/plugin"
import type {
  AgentConfig as OpenCodeV2AgentConfig,
  Config as OpenCodeV2ConfigContract,
  PermissionConfig as OpenCodeV2PermissionConfig,
} from "@opencode-ai/sdk/v2"

export const ROLE_IDS = ["cortex", "flux", "zen"] as const
export type RoleId = (typeof ROLE_IDS)[number]

export const PLUGIN_IDS = ["background-tasks", "zellij", "command-run"] as const
export type IndependentPluginId = (typeof PLUGIN_IDS)[number]

export const HOOK_IDS = ["tool-audit"] as const
export type ArchetypeHookId = (typeof HOOK_IDS)[number]

export type OpenCodeAgentConfig = OpenCodeV2AgentConfig
export type OpenCodeV2Config = OpenCodeV2ConfigContract
export type OpenCodePermissionConfig = Exclude<OpenCodeV2PermissionConfig, string>
export type OpenCodeHooks = Hooks

export interface ModelSettings {
  readonly model?: string
  readonly variant?: string
  readonly temperature?: number
  readonly topP?: number
  readonly steps?: number
}

export interface PromptAdditions {
  readonly identity: string
  readonly security: readonly string[]
  readonly task: string
}

export interface ArchetypeConfig {
  readonly id: RoleId
  readonly displayName: string
  readonly description: string
  readonly enabled: boolean
  readonly mode: "all"
  readonly hidden: boolean
  readonly color: NonNullable<OpenCodeAgentConfig["color"]>
  readonly model: ModelSettings
  readonly permissions: OpenCodePermissionConfig
  readonly plugins: readonly IndependentPluginId[]
  readonly hooks: readonly ArchetypeHookId[]
  readonly prompts: PromptAdditions
}

export type ArchetypeRegistry = Readonly<Record<RoleId, ArchetypeConfig>>

export interface HarnessOptions {
  readonly enabled?: Partial<Record<RoleId, boolean>>
}

export interface HookRoute {
  readonly roleId: RoleId
  readonly hookId: ArchetypeHookId
  readonly sessionID: string
}

export const TASK_TYPES = [
  "implementation",
  "debugging",
  "architecture",
  "review",
  "research",
  "visual_inspection",
] as const
export type TaskType = (typeof TASK_TYPES)[number]

export interface TaskCheckpoint {
  readonly version: 1
  readonly task_group: string
  readonly task_type: TaskType
  readonly status: "doing" | "question" | "done"
  readonly compact_context: string
}
