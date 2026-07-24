import type { CommandRunTrace } from "./types"

export type ToastStatus = "complete" | "failed" | "cancelled" | "timed_out"

type NotifierInput = {
  directory: string
  showToast?: (input: {
    body: { message: string; variant: "success" | "error" | "warning" }
    query: { directory: string }
  }) => Promise<unknown>
  longRunningMs?: number
  minimumIntervalMs?: number
  now?: () => number
}

export function createNotifier(input: NotifierInput): {
  progress(trace: CommandRunTrace): void
  final(status: ToastStatus, message: string): Promise<void>
} {
  const longRunningMs = input.longRunningMs ?? 5_000
  const minimumIntervalMs = input.minimumIntervalMs ?? 250
  const now = input.now ?? Date.now
  let started = false
  let finished = false
  let lastSentAt = Number.NEGATIVE_INFINITY
  let longRunning: ReturnType<typeof setTimeout> | undefined
  let pending = Promise.resolve()
  let latestTrace: CommandRunTrace | undefined
  const lastPhase = new Map<number, string>()
  const startedSteps = new Set<number>()
  const completedSteps = new Set<number>()
  const notifiedTerminal = new Set<string>()

  const enqueue = (message: string, variant: "success" | "error" | "warning"): void => {
    pending = pending.then(async () => {
      const delay = Math.max(0, minimumIntervalMs - (now() - lastSentAt))
      if (delay > 0) await Bun.sleep(delay)
      if (!input.showToast) return
      try {
        await input.showToast({ body: { message, variant }, query: { directory: input.directory } })
        lastSentAt = now()
      } catch {
        // Metadata and the ordered result remain authoritative when no compatible TUI is attached.
      }
    })
  }

  return {
    progress(trace) {
      latestTrace = trace
      if (!started && trace.records.length > 0) {
        started = true
        enqueue(`command_run started: ${trace.summary.total} command(s)`, "warning")
        longRunning = setTimeout(() => {
          if (finished || !latestTrace) return
          const summary = latestTrace.summary
          const terminal = summary.completed + summary.failed + summary.denied + summary.cancelled + summary.timedOut
          enqueue(`command_run still running: ${terminal}/${summary.total} terminal`, "warning")
        }, longRunningMs)
      }

      for (const record of trace.records) {
        const previous = lastPhase.get(record.inputIndex)
        if (previous === record.phase) continue
        lastPhase.set(record.inputIndex, record.phase)
        if ((record.phase === "rewriting" || record.phase === "running") && !startedSteps.has(record.step)) {
          startedSteps.add(record.step)
          enqueue(childMessage(record, "started", record.commandLine), "warning")
        }
        if (record.phase === "completed" && !completedSteps.has(record.step)) {
          completedSteps.add(record.step)
          enqueue(childMessage(record, "completed", record.resultPreview), "success")
        }
        if (record.phase === "failed" || record.phase === "denied" || record.phase === "cancelled" || record.phase === "timed_out") {
          const status = record.phase === "denied" ? "failed" : record.phase
          if (notifiedTerminal.has(status)) continue
          notifiedTerminal.add(status)
          enqueue(
            childMessage(record, record.phase, record.resultPreview),
            status === "failed" ? "error" : "warning"
          )
        }
      }
    },
    async final(status, message) {
      finished = true
      if (longRunning) clearTimeout(longRunning)
      enqueue(message, variantFor(status))
      await pending
    },
  }
}

function childMessage(
  record: CommandRunTrace["records"][number],
  status: string,
  summary?: string
): string {
  const detail = summary ? `: ${summary}` : ""
  return `command_run child #${record.inputIndex} ${record.commandType} ${status} (step ${record.step})${detail}`
}

function variantFor(status: ToastStatus): "success" | "error" | "warning" {
  if (status === "complete") return "success"
  if (status === "failed") return "error"
  return "warning"
}
