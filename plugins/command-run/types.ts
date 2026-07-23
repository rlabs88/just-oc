export const COMMAND_TYPES = [
  "read",
  "glob",
  "grep",
  "apply_patch",
  "shell",
  "task_status",
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
}

export type TaskCheckpoint = {
  version: 1
  task_group: string
  task_type: "implementation" | "debugging" | "architecture" | "review" | "research" | "visual_inspection"
  status: "doing" | "question" | "done"
  compact_context: string
}
