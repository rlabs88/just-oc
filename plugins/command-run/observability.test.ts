import { describe, expect, test } from "bun:test"
import { exists, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { executeAdapter } from "./adapters"
import { createNotifier } from "./notifications"
import { parseCommands } from "./parser"
import { runCommandSchedule } from "./scheduler"
import { createCommandRunTool } from "./tool"
import { createTraceRecorder } from "./trace"
import type { CommandRunTrace, ParsedCommand } from "./types"

describe("command_run observability", () => {
  test("requires a bounded one-line child summary for stock generic clients", () => {
    const definition = createCommandRunTool({} as never)
    const description = definition.args.description as unknown as {
      safeParse(input: unknown): { success: boolean }
    }

    expect(description.safeParse("Step 1 · Read package.json · Glob plugins/**/*.ts → Step 2 · Shell bun test").success).toBe(true)
    expect(description.safeParse("").success).toBe(false)
    expect(description.safeParse("Step 1 · Read package.json\nStep 2 · Shell bun test").success).toBe(false)
    expect(description.safeParse("x".repeat(4_001)).success).toBe(false)
  })

  test("applies a bounded default execution timeout and rejects invalid bounds", () => {
    const [command] = parseCommands([{ command_type: "shell", command_line: "printf ok", step: 1 }])
    expect(command.timeout_ms).toBe(120_000)

    expect(() => parseCommands([{ command_type: "shell", command_line: "printf ok", step: 1, timeout_ms: 99 }]))
      .toThrow("timeout_ms must be an integer between 100 and 300000")
    expect(() => parseCommands([{ command_type: "shell", command_line: "printf ok", step: 1, timeout_ms: 300_001 }]))
      .toThrow("timeout_ms must be an integer between 100 and 300000")
  })

  test("publishes permission, rewrite, running, and completed records with bounded diagnostics", async () => {
    const command: ParsedCommand = {
      command_type: "shell",
      command_line: `printf ok # ${"x".repeat(500)}`,
      step: 1,
      inputIndex: 0,
      timeout_ms: 1_000,
    }
    const traces: CommandRunTrace[] = []
    let now = 1_000

    const [result] = await runCommandSchedule([command], {
      signal: new AbortController().signal,
      ask: async () => { now += 10 },
      execute: async (_command, _signal, updatePhase) => {
        updatePhase("rewriting", { originalCommand: command.command_line, rewriteStatus: "rewritten" })
        now += 20
        updatePhase("running", { executedCommand: "rtk printf ok" })
        now += 30
        return {
          output: "ok",
          metadata: {
            originalCommand: command.command_line,
            executedCommand: "rtk printf ok",
            rewriteStatus: "rewritten",
            exitCode: 0,
            stdoutChars: 2,
            stderrChars: 0,
            stdoutTruncated: false,
            stderrTruncated: false,
          },
        }
      },
      onTrace: (trace) => traces.push(structuredClone(trace)),
      now: () => now,
      maxOutputChars: 20_000,
    })

    expect(traces.flatMap((trace) => trace.records.map((record) => record.phase))).toEqual([
      "queued",
      "permission",
      "rewriting",
      "running",
      "completed",
    ])
    expect(result.status).toBe("completed")
    const record = traces.at(-1)!.records[0]
    expect(record.commandLine.length).toBeLessThan(command.command_line.length)
    expect(record.originalCommand).toBeDefined()
    expect(record.executedCommand).toBe("rtk printf ok")
    expect(record).toMatchObject({
      version: 1,
      inputIndex: 0,
      step: 1,
      commandType: "shell",
      phase: "completed",
      terminalStatus: "completed",
      durationMs: 60,
      exitCode: 0,
      stdoutChars: 2,
      stderrChars: 0,
      stdoutTruncated: false,
      stderrTruncated: false,
      resultPreview: "ok",
    })
  })

  test("reports execution timeout separately from session cancellation", async () => {
    const command: ParsedCommand = {
      command_type: "shell",
      command_line: "sleep 5",
      step: 1,
      inputIndex: 0,
      timeout_ms: 100,
    }
    const traces: CommandRunTrace[] = []

    const [result] = await runCommandSchedule([command], {
      signal: new AbortController().signal,
      ask: async () => {},
      execute: async (_command, signal, updatePhase) => {
        updatePhase("rewriting")
        await Bun.sleep(20)
        updatePhase("running")
        await new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }))
        throw new Error("unreachable")
      },
      onTrace: (trace) => traces.push(structuredClone(trace)),
      maxOutputChars: 20_000,
    })

    expect(result.status).toBe("timed_out")
    expect(traces.at(-1)!.records[0]).toMatchObject({
      phase: "timed_out",
      terminalStatus: "timed_out",
    })
  })

  test("allows a two-second foreground command when its execution timeout is longer", async () => {
    const [command] = parseCommands([{
      command_type: "shell",
      command_line: "sleep 2; printf done",
      step: 1,
      timeout_ms: 2_750,
    }])
    const startedAt = Date.now()
    const traces: CommandRunTrace[] = []
    const [result] = await runCommandSchedule([command], {
      signal: new AbortController().signal,
      ask: async () => {},
      execute: (item, signal, updatePhase) => executeAdapter(item, process.cwd(), signal, {}, updatePhase),
      onTrace: (trace) => traces.push(structuredClone(trace)),
      maxOutputChars: 20_000,
    })

    expect(result.status).toBe("completed")
    expect(result.output).toBe("done")
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(1_900)
    expect(result.metadata.exitCode).toBe(0)
    expect(traces.at(-1)?.records[0]).toMatchObject({
      phase: "completed",
      terminalStatus: "completed",
      exitCode: 0,
    })
    expect(traces.at(-1)?.records[0].durationMs).toBeGreaterThanOrEqual(1_900)
  }, 5_000)

  test("kills the detached process group before a timed-out descendant can write", async () => {
    const fixture = await mkdtemp(join(tmpdir(), "command-run-timeout-"))
    const marker = join(fixture, "late-output")
    const quotedMarker = `'${marker.replaceAll("'", `'\\''`)}'`
    const [command] = parseCommands([{
      command_type: "shell",
      command_line: `printf started; sh -c 'trap "" TERM; sleep 0.6; printf leaked > ${quotedMarker}'`,
      step: 1,
      timeout_ms: 100,
    }])
    const traces: CommandRunTrace[] = []

    try {
      const [result] = await runCommandSchedule([command], {
        signal: new AbortController().signal,
        ask: async () => {},
        execute: (item, signal, updatePhase) => executeAdapter(item, process.cwd(), signal, {}, updatePhase),
        onTrace: (trace) => traces.push(structuredClone(trace)),
        maxOutputChars: 20_000,
      })
      expect(result.status).toBe("timed_out")
      expect(result.metadata).toMatchObject({
        stdoutChars: 7,
        stderrChars: 0,
        stdoutTruncated: false,
        stderrTruncated: false,
      })
      expect(typeof result.metadata.exitCode).toBe("number")
      expect(traces.at(-1)?.records[0]).toMatchObject({
        phase: "timed_out",
        terminalStatus: "timed_out",
        stdoutChars: 7,
        stderrChars: 0,
        stdoutTruncated: false,
        stderrTruncated: false,
      })
      expect(typeof traces.at(-1)?.records[0].exitCode).toBe("number")
      await Bun.sleep(700)
      expect(await exists(marker)).toBe(false)
    } finally {
      await rm(fixture, { recursive: true, force: true })
    }
  }, 3_000)

  test("returns all twenty ordered trace records in metadata and final output", async () => {
    const metadata: CommandRunTrace[] = []
    const toasts: string[] = []
    const definition = createCommandRunTool({
      tui: { showToast: async ({ body }: { body: { message: string } }) => toasts.push(body.message) },
    } as never)
    const commands = Array.from({ length: 20 }, (_, inputIndex) => ({
      command_type: "task_status" as const,
      command_line: JSON.stringify({
        task_group: `trace-${inputIndex}`,
        task_type: ["implementation"],
        status: "doing",
      }),
      step: 1,
    }))

    const result = await definition.execute({ commands }, {
      sessionID: "session",
      messageID: "message",
      agent: "cortex",
      directory: process.cwd(),
      worktree: process.cwd(),
      abort: new AbortController().signal,
      ask: async () => {},
      metadata: ({ metadata: value }) => metadata.push(structuredClone(value?.commandRun)),
    })

    expect(typeof result).toBe("object")
    if (typeof result === "string") throw new Error("expected structured tool result")
    const finalTrace = result.metadata?.commandRun as CommandRunTrace
    const output = JSON.parse(result.output) as { commandRun: CommandRunTrace }
    expect(finalTrace.records).toHaveLength(20)
    expect(finalTrace.records.map((record) => record.inputIndex)).toEqual(Array.from({ length: 20 }, (_, index) => index))
    expect(finalTrace.records.every((record) => record.phase === "completed")).toBe(true)
    expect(output.commandRun).toEqual(finalTrace)
    expect(metadata.some((trace) => trace.records.some((record) => record.phase === "permission"))).toBe(true)
    expect(metadata.some((trace) => trace.records.some((record) => record.phase === "running"))).toBe(true)
    expect(toasts.some((message) => message.includes("child #0 task_status started"))).toBe(true)
    expect(toasts.some((message) => message.includes(commands[0].command_line))).toBe(true)
    expect(toasts.some((message) => message.includes("complete"))).toBe(true)
  }, 4_000)

  test("keeps a maximum shell trace below the aggregate result cap", () => {
    const commands = Array.from({ length: 20 }, (_, inputIndex): ParsedCommand => ({
      command_type: "shell",
      command_line: "x".repeat(500),
      step: 1,
      inputIndex,
      timeout_ms: 120_000,
    }))
    const recorder = createTraceRecorder(commands, () => {}, () => 1_700_000_000_000)

    for (const command of commands) {
      recorder.transition(command.inputIndex, "permission")
      recorder.transition(command.inputIndex, "rewriting", { originalCommand: "o".repeat(500) })
      recorder.transition(command.inputIndex, "running", {
        executedCommand: "e".repeat(500),
        rewriteStatus: "rewritten",
      })
      recorder.transition(command.inputIndex, "completed", {
        exitCode: 0,
        stdoutChars: 40_000,
        stderrChars: 40_000,
        stdoutTruncated: true,
        stderrTruncated: true,
        resultPreview: "p".repeat(500),
      })
    }

    const serialized = JSON.stringify({ version: 1, commandRun: recorder.snapshot() })
    expect(serialized.length).toBeLessThanOrEqual(20_000)
    expect(recorder.snapshot().records).toHaveLength(20)
  })

  test("coalesces long-running milestones and treats toast failures as non-fatal", async () => {
    const messages: string[] = []
    const trace: CommandRunTrace = {
      version: 1,
      records: [],
      summary: { total: 1, completed: 0, failed: 0, denied: 0, cancelled: 0, timedOut: 0 },
    }
    const notifier = createNotifier({
      directory: process.cwd(),
      minimumIntervalMs: 0,
      longRunningMs: 10,
      showToast: async ({ body }) => {
        messages.push(body.message)
        if (body.message.includes("complete")) throw new Error("no TUI")
      },
    })
    trace.records.push({
      version: 1,
      inputIndex: 0,
      step: 1,
      commandType: "shell",
      commandLine: "sleep 1",
      phase: "running",
      timestamps: { queued: 0, running: 1 },
      durationMs: 1,
      stdoutChars: 0,
      stderrChars: 0,
      stdoutTruncated: false,
      stderrTruncated: false,
    })
    notifier.progress(trace)
    await Bun.sleep(20)
    await notifier.final("complete", "command_run complete")

    expect(messages.filter((message) => message.includes("started"))).toHaveLength(2)
    expect(messages.some((message) => message.includes("sleep 1"))).toBe(true)
    expect(messages.filter((message) => message.includes("still running"))).toHaveLength(1)
    expect(messages.at(-1)).toBe("command_run complete")
  })
})
