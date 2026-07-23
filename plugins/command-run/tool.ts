import { tool, type PluginInput, type ToolDefinition } from "@opencode-ai/plugin"
import { executeAdapter, permissionPatterns } from "./adapters"
import { createNotifier } from "./notifications"
import { parseCommands } from "./parser"
import { runCommandSchedule } from "./scheduler"
import { COMMAND_TYPES, type CommandInput, type CommandProgress, type TaskCheckpoint } from "./types"

const MAX_RESULT_CHARS = 20_000

export function createCommandRunTool(client: PluginInput["client"]): ToolDefinition {
  return tool({
    description: "Run 1–20 permission-gated local commands with dependency-step barriers and ordered results.",
    args: {
      commands: tool.schema.array(tool.schema.object({
        command_type: tool.schema.enum(COMMAND_TYPES),
        command_line: tool.schema.string().min(1),
        step: tool.schema.number().int().positive(),
      }).strict()).min(1).max(20),
    },
    async execute(args, context) {
      const commands = parseCommands(args.commands as CommandInput[])
      const notifier = createNotifier({
        directory: context.directory,
        showToast: (input) => client.tui.showToast(input),
      })
      const publishProgress = (progress: CommandProgress) => context.metadata({
        title: "Running command batch",
        metadata: { commandRun: progress },
      })
      const results = await runCommandSchedule(commands, {
        signal: context.abort,
        maxOutputChars: MAX_RESULT_CHARS,
        onProgress: publishProgress,
        ask: async (command) => context.ask({
          permission: `command_run_${command.command_type}`,
          patterns: await permissionPatterns(command, context.directory),
          always: [],
          metadata: { commandType: command.command_type, step: command.step, inputIndex: command.inputIndex },
        }),
        execute: (command) => executeAdapter(command, context.directory, context.abort),
      })
      const failed = results.some((result) => result.status === "failed" || result.status === "denied")
      const cancelled = results.some((result) => result.status === "cancelled")
      const finalStatus = failed ? "failed" : cancelled ? "cancelled" : "complete"
      await notifier.final(finalStatus, `command_run ${finalStatus}: ${results.filter((result) => result.status === "completed").length}/${results.length} completed`)
      const taskStatus = latestTaskStatus(results)
      return {
        title: `command_run ${finalStatus}`,
        output: serializeBoundedResults(results, MAX_RESULT_CHARS),
        metadata: {
          commandRun: summarize(results),
          ...(taskStatus ? { taskStatus } : {}),
        },
      }
    },
  })
}

function latestTaskStatus(results: Awaited<ReturnType<typeof runCommandSchedule>>): TaskCheckpoint | undefined {
  for (let index = results.length - 1; index >= 0; index -= 1) {
    const value = results[index].metadata.taskStatus
    if (results[index].status === "completed" && isTaskCheckpoint(value)) return value
  }
  return undefined
}

function summarize(results: Awaited<ReturnType<typeof runCommandSchedule>>): Omit<CommandProgress, "step"> & { step: number } {
  return {
    step: Math.max(...results.map((result) => result.step)),
    total: results.length,
    completed: results.filter((result) => result.status === "completed").length,
    failed: results.filter((result) => result.status === "failed").length,
    denied: results.filter((result) => result.status === "denied").length,
    cancelled: results.filter((result) => result.status === "cancelled").length,
  }
}

function isTaskCheckpoint(value: unknown): value is TaskCheckpoint {
  return typeof value === "object" && value !== null && "version" in value && value.version === 1
}

function serializeBoundedResults(
  results: Awaited<ReturnType<typeof runCommandSchedule>>,
  maximum: number
): string {
  const bounded = results.map((result) => ({ ...result }))
  let serialized = JSON.stringify(bounded)
  while (serialized.length > maximum) {
    const longest = bounded.reduce((candidate, result) =>
      result.output.length > candidate.output.length ? result : candidate
    )
    const marker = "… result truncated"
    if (longest.output.length > marker.length) {
      longest.output = `${longest.output.slice(0, Math.floor(longest.output.length / 2))}${marker}`
      serialized = JSON.stringify(bounded)
      continue
    }
    if (longest.output.length > 0) {
      longest.output = ""
      serialized = JSON.stringify(bounded)
      continue
    }
    const withMetadata = bounded.find((result) => Object.keys(result.metadata).length > 0)
    if (!withMetadata) break
    withMetadata.metadata = {}
    serialized = JSON.stringify(bounded)
  }
  return serialized
}
