import { tool, type PluginInput, type ToolDefinition } from "@opencode-ai/plugin"
import { executeAdapter, executionClass, permissionPatterns } from "./adapters"
import { createNotifier, type ToastStatus } from "./notifications"
import { parseCommands } from "./parser"
import { runCommandSchedule } from "./scheduler"
import { COMMAND_TYPES, type CommandInput, type CommandRunTrace, type TaskCheckpoint } from "./types"

const MAX_RESULT_CHARS = 20_000
const MAX_ATTACHMENTS = 4
const MAX_ATTACHMENT_BYTES = 20 * 1_048_576
const COMMAND_GRAMMAR = `Run 1–20 permission-gated commands behind positive-integer dependency steps. Each command may set timeout_ms from 100 to 300000 milliseconds; the default is 120000 and begins only when execution starts. Put every currently needed command whose input is already known into one batch. Independent read, search, list, and task-state commands must share a step; commands that depend on earlier output use a later step. Do not add a probe whose input depends on another command in the same batch. Commands in a later step wait for every command in earlier steps. command_line grammar by type: read JSON {"path":string,"offset"?:integer,"limit"?:integer}; glob JSON {"pattern":string,"path"?:string}; grep JSON {"pattern":string,"path"?:string,"include"?:string}; apply_patch raw unified diff; shell raw foreground shell command; task_status JSON {"task_group":string,"task_type":["implementation"|"new_build"|"debugging"|"refactoring"|"architecture"|"review"|"research"|"data_research"|"visual_inspection"|"frontend"|"website"|"interactive_3d"|"editorial"|"operations"],"status":"doing"|"question"|"done","compact_context"?:string}; web_discover JSON {"url":http-or-https-url,"mode":"extract"} or {"url":http-or-https-url,"mode":"download","path":workspace-relative-path}; read_media JSON {"path":string,"offset"?:integer,"limit"?:integer}.`

export function createCommandRunTool(client: PluginInput["client"]): ToolDefinition {
  return tool({
    description: COMMAND_GRAMMAR,
    args: {
      commands: tool.schema.array(tool.schema.object({
        command_type: tool.schema.enum(COMMAND_TYPES),
        command_line: tool.schema.string().min(1),
        step: tool.schema.number().int().positive(),
        timeout_ms: tool.schema.number().int().min(100).max(300_000).optional(),
      }).strict()).min(1).max(20),
    },
    async execute(args, context) {
      const commands = parseCommands(args.commands as CommandInput[])
      const notifier = createNotifier({
        directory: context.directory,
        showToast: (input) => client.tui.showToast(input),
      })
      let latestTrace: CommandRunTrace | undefined
      const publishTrace = (trace: CommandRunTrace): void => {
        latestTrace = trace
        context.metadata({
          title: titleFor(trace),
          metadata: { commandRun: trace },
        })
        notifier.progress(trace)
      }
      const results = await runCommandSchedule(commands, {
        signal: context.abort,
        maxOutputChars: MAX_RESULT_CHARS,
        maxAttachments: MAX_ATTACHMENTS,
        maxAttachmentBytes: MAX_ATTACHMENT_BYTES,
        onTrace: publishTrace,
        ask: async (command) => context.ask({
          permission: `command_run_${command.command_type}`,
          patterns: await permissionPatterns(command, context.directory),
          always: [],
          metadata: { commandType: command.command_type, step: command.step, inputIndex: command.inputIndex },
        }),
        execute: (command, signal, updatePhase) => executeAdapter(
          command,
          context.directory,
          signal,
          {},
          updatePhase
        ),
        executionClass,
      })
      const trace = latestTrace ?? emptyTrace()
      const finalStatus = finalStatusFor(trace)
      await notifier.final(
        finalStatus,
        `command_run ${finalStatus}: ${trace.summary.completed}/${trace.summary.total} completed`
      )
      const taskStatus = latestTaskStatus(results)
      const attachments = collectAttachments(results)
      return {
        title: `command_run ${finalStatus}`,
        output: serializeBoundedRun(results, trace, MAX_RESULT_CHARS),
        metadata: {
          commandRun: trace,
          ...(taskStatus ? { taskStatus } : {}),
        },
        ...(attachments.length ? { attachments } : {}),
      }
    },
  })
}

function titleFor(trace: CommandRunTrace): string {
  const active = trace.records.find((record) => record.phase === "rewriting" || record.phase === "running")
  if (active) return `command_run step ${active.step}: ${active.commandType}`
  return "Running command batch"
}

function finalStatusFor(trace: CommandRunTrace): ToastStatus {
  if (trace.summary.timedOut > 0) return "timed_out"
  if (trace.summary.failed > 0 || trace.summary.denied > 0) return "failed"
  if (trace.summary.cancelled > 0) return "cancelled"
  return "complete"
}

function emptyTrace(): CommandRunTrace {
  return {
    version: 1,
    records: [],
    summary: { total: 0, completed: 0, failed: 0, denied: 0, cancelled: 0, timedOut: 0 },
  }
}

function latestTaskStatus(results: Awaited<ReturnType<typeof runCommandSchedule>>): TaskCheckpoint | undefined {
  for (let index = results.length - 1; index >= 0; index -= 1) {
    const value = results[index].metadata.taskStatus
    if (results[index].status === "completed" && isTaskCheckpoint(value)) return value
  }
  return undefined
}

function isTaskCheckpoint(value: unknown): value is TaskCheckpoint {
  return typeof value === "object" && value !== null && "version" in value && value.version === 1
}

function serializeBoundedRun(
  results: Awaited<ReturnType<typeof runCommandSchedule>>,
  trace: CommandRunTrace,
  maximum: number
): string {
  const bounded = results.map(({ attachments, ...result }) => ({
    ...result,
    ...(attachments?.length ? {
      metadata: {
        ...result.metadata,
        attachments: attachments.map(({ mime, filename, byteLength }) => ({ mime, filename, byteLength })),
      },
    } : {}),
  }))
  const payload: { version: 1; commandRun: CommandRunTrace; results?: typeof bounded } = {
    version: 1,
    commandRun: trace,
    results: bounded,
  }
  const mandatory = JSON.stringify({ version: 1, commandRun: trace })
  if (mandatory.length > maximum) {
    throw new Error(`command_run trace exceeds ${maximum} characters`)
  }
  let serialized = JSON.stringify(payload)
  while (serialized.length > maximum) {
    const longest = bounded.reduce((candidate, result) =>
      result.output.length > candidate.output.length ? result : candidate
    )
    const marker = "… result truncated"
    if (longest.output.length > marker.length) {
      longest.output = `${longest.output.slice(0, Math.floor(longest.output.length / 2))}${marker}`
      serialized = JSON.stringify(payload)
      continue
    }
    if (longest.output.length > 0) {
      longest.output = ""
      serialized = JSON.stringify(payload)
      continue
    }
    const withMetadata = bounded.find((result) => Object.keys(result.metadata).length > 0)
    if (!withMetadata) break
    withMetadata.metadata = {}
    serialized = JSON.stringify(payload)
  }
  if (serialized.length <= maximum) return serialized
  return mandatory
}

function collectAttachments(results: Awaited<ReturnType<typeof runCommandSchedule>>) {
  const selected: Array<{ type: "file"; mime: string; url: string; filename?: string }> = []
  let bytes = 0
  for (const result of results) {
    if (result.status !== "completed") continue
    for (const attachment of result.attachments ?? []) {
      if (selected.length >= MAX_ATTACHMENTS || bytes + attachment.byteLength > MAX_ATTACHMENT_BYTES) {
        throw new Error(`command_run attachments exceed ${MAX_ATTACHMENTS} files or ${MAX_ATTACHMENT_BYTES} bytes`)
      }
      bytes += attachment.byteLength
      const { byteLength: _byteLength, ...publicAttachment } = attachment
      selected.push(publicAttachment)
    }
  }
  return selected
}
