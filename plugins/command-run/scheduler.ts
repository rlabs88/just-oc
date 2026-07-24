import type {
  AdapterResult,
  CommandProgress,
  CommandResult,
  ParsedCommand,
  ExecutionClass,
} from "./types"

type ScheduleDependencies = {
  signal: AbortSignal
  ask(command: ParsedCommand): Promise<void>
  execute(command: ParsedCommand): Promise<AdapterResult>
  executionClass?(command: ParsedCommand): ExecutionClass
  onProgress(progress: CommandProgress): void
  maxOutputChars: number
  maxAttachments?: number
  maxAttachmentBytes?: number
}

export async function runCommandSchedule(
  commands: readonly ParsedCommand[],
  dependencies: ScheduleDependencies
): Promise<CommandResult[]> {
  const ordered = [...commands].sort((left, right) => left.step - right.step || left.inputIndex - right.inputIndex)
  const results = new Map<number, CommandResult>()
  const attachmentBudget = { count: 0, bytes: 0 }
  const steps = [...new Set(ordered.map((command) => command.step))]
  let stopAfterStep = false

  emitProgress(results, ordered.length, steps[0] ?? 1, dependencies)
  for (const step of steps) {
    const current = ordered.filter((command) => command.step === step)
    if (stopAfterStep || dependencies.signal.aborted) {
      for (const command of current) results.set(command.inputIndex, cancelledResult(command))
      emitProgress(results, ordered.length, step, dependencies)
      continue
    }

    for (let index = 0; index < current.length;) {
      const command = current[index]
      if (classFor(command, dependencies) !== "parallel-read") {
        const result = await runOne(command, dependencies, ordered.length, results, attachmentBudget)
        results.set(command.inputIndex, result)
        stopAfterStep ||= result.status !== "completed"
        index += 1
        emitProgress(results, ordered.length, step, dependencies)
        if (result.status !== "completed") {
          for (const later of current.slice(index)) {
            results.set(later.inputIndex, cancelledResult(later))
          }
          index = current.length
          emitProgress(results, ordered.length, step, dependencies)
        }
        continue
      }

      const readBatch: ParsedCommand[] = []
      while (index < current.length && classFor(current[index], dependencies) === "parallel-read") {
        readBatch.push(current[index])
        index += 1
      }
      const batchResults = await Promise.all(
        readBatch.map((item) => runOne(item, dependencies, ordered.length, results, attachmentBudget))
      )
      batchResults.forEach((result) => results.set(result.inputIndex, result))
      const batchFailed = batchResults.some((result) => result.status !== "completed")
      stopAfterStep ||= batchFailed
      emitProgress(results, ordered.length, step, dependencies)
      if (batchFailed) {
        for (const later of current.slice(index)) results.set(later.inputIndex, cancelledResult(later))
        emitProgress(results, ordered.length, step, dependencies)
        break
      }
    }
  }

  return ordered.map((command) => results.get(command.inputIndex) ?? cancelledResult(command))
}

async function runOne(
  command: ParsedCommand,
  dependencies: ScheduleDependencies,
  total: number,
  completedResults: Map<number, CommandResult>,
  attachmentBudget: { count: number; bytes: number }
): Promise<CommandResult> {
  if (dependencies.signal.aborted) return cancelledResult(command)
  dependencies.onProgress(progressForActive(command, total, completedResults))
  try {
    await dependencies.ask(command)
    if (dependencies.signal.aborted) return cancelledResult(command)
    const result = await dependencies.execute(command)
    if (dependencies.signal.aborted) return cancelledResult(command)
    reserveAttachments(result, attachmentBudget, dependencies)
    return makeResult(command, "completed", boundOutput(result.output, dependencies.maxOutputChars), result.metadata, result.attachments)
  } catch (error) {
    if (dependencies.signal.aborted || isAbort(error)) return cancelledResult(command)
    const status = isDenied(error) ? "denied" : "failed"
    return makeResult(command, status, boundOutput(errorMessage(error), dependencies.maxOutputChars))
  }
}

function reserveAttachments(
  result: AdapterResult,
  budget: { count: number; bytes: number },
  dependencies: ScheduleDependencies
): void {
  const attachments = result.attachments ?? []
  const nextCount = budget.count + attachments.length
  const nextBytes = budget.bytes + attachments.reduce((sum, attachment) => sum + attachment.byteLength, 0)
  if (dependencies.maxAttachments !== undefined && nextCount > dependencies.maxAttachments) {
    throw new Error(`command_run attachments exceed ${dependencies.maxAttachments} files`)
  }
  if (dependencies.maxAttachmentBytes !== undefined && nextBytes > dependencies.maxAttachmentBytes) {
    throw new Error(`command_run attachments exceed ${dependencies.maxAttachmentBytes} bytes`)
  }
  budget.count = nextCount
  budget.bytes = nextBytes
}

function progressForActive(
  command: ParsedCommand,
  total: number,
  completedResults: Map<number, CommandResult>
): CommandProgress {
  const values = [...completedResults.values()]
  return {
    step: command.step,
    activeIndex: command.inputIndex,
    activeType: command.command_type,
    total,
    completed: count(values, "completed"),
    failed: count(values, "failed"),
    denied: count(values, "denied"),
    cancelled: count(values, "cancelled"),
  }
}

function emitProgress(
  results: Map<number, CommandResult>,
  total: number,
  step: number,
  dependencies: ScheduleDependencies
): void {
  const values = [...results.values()]
  dependencies.onProgress({
    step,
    total,
    completed: count(values, "completed"),
    failed: count(values, "failed"),
    denied: count(values, "denied"),
    cancelled: count(values, "cancelled"),
  })
}

function count(results: readonly CommandResult[], status: CommandResult["status"]): number {
  return results.filter((result) => result.status === status).length
}

function makeResult(
  command: ParsedCommand,
  status: CommandResult["status"],
  output: string,
  metadata: Record<string, unknown> = {},
  attachments?: AdapterResult["attachments"]
): CommandResult {
  return { command_type: command.command_type, inputIndex: command.inputIndex, step: command.step, status, output, metadata, ...(attachments?.length ? { attachments } : {}) }
}

function classFor(command: ParsedCommand, dependencies: ScheduleDependencies): ExecutionClass {
  return dependencies.executionClass?.(command)
    ?? (command.command_type === "read" || command.command_type === "glob" || command.command_type === "grep" || command.command_type === "task_status" ? "parallel-read" : "mutation")
}

function cancelledResult(command: ParsedCommand): CommandResult {
  return makeResult(command, "cancelled", "Cancelled because an earlier step did not complete.")
}

function boundOutput(output: string, maximum: number): string {
  if (output.length <= maximum) return output
  const marker = "\n… output truncated"
  return `${output.slice(0, Math.max(0, maximum - marker.length))}${marker}`.slice(0, maximum)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isDenied(error: unknown): boolean {
  const text = `${error instanceof Error ? error.name : ""} ${errorMessage(error)}`.toLowerCase()
  return text.includes("permission") && (text.includes("denied") || text.includes("reject"))
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.message.toLowerCase().includes("aborted"))
}
