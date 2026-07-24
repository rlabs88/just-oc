export const COMMAND_TYPES = [
  "read",
  "glob",
  "grep",
  "apply_patch",
  "shell",
  "task_status",
  "web_discover",
  "read_media",
] as const

export type CommandType = (typeof COMMAND_TYPES)[number]
export type CommandInput = {
  command_type: CommandType
  command_line: string
  step: number
}

export type ParsedCommand = CommandInput & { inputIndex: number }
export type CommandStatus = "completed" | "failed" | "denied" | "cancelled"
export type CommandResult = {
  command_type: CommandType
  inputIndex: number
  step: number
  status: CommandStatus
  output: string
  metadata: Record<string, unknown>
  attachments?: CommandAttachment[]
}

export type CommandProgress = {
  step: number
  activeIndex?: number
  activeType?: CommandType
  total: number
  completed: number
  failed: number
  denied: number
  cancelled: number
}

export type AdapterResult = {
  output: string
  metadata?: Record<string, unknown>
  attachments?: CommandAttachment[]
}

export type CommandAttachment = {
  type: "file"
  mime: string
  url: string
  filename?: string
  byteLength: number
}

export type ExecutionClass = "parallel-read" | "exclusive-read" | "mutation"

export const TASK_TYPES = [
  "implementation",
  "new_build",
  "debugging",
  "refactoring",
  "architecture",
  "review",
  "research",
  "data_research",
  "visual_inspection",
  "frontend",
  "website",
  "interactive_3d",
  "editorial",
  "operations",
] as const
export type TaskType = (typeof TASK_TYPES)[number]

export type TaskCheckpoint = {
  version: 1
  task_group: string
  task_type: readonly TaskType[]
  status: "doing" | "question" | "done"
  compact_context?: string
}
