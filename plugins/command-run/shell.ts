import type { AdapterResult } from "./types"

const MAX_OUTPUT_CHARS = 40_000
const MAX_REWRITE_CHARS = 8_192
const MAX_METADATA_COMMAND_CHARS = 200
const REWRITE_TIMEOUT_MS = 2_000

type RewriteStatus =
  | "rewritten"
  | "rewritten-ask"
  | "disabled"
  | "already-rtk"
  | "ineligible"
  | "unavailable"
  | "unchanged"
  | "exit-1"
  | "exit-2"
  | "failed"
  | "timeout"

export type ShellDependencies = {
  rtkExecutable?: string
  shellExecutable?: string
  rewriteTimeoutMs?: number
  environment?: Record<string, string | undefined>
}

type RewriteDecision = {
  command: string
  status: RewriteStatus
}

type ProcessResult = {
  stdout: string
  stderr: string
  exitCode: number
  stdoutTruncated: boolean
  stderrTruncated: boolean
}

type ShellMetadata = {
  originalCommand: string
  executedCommand: string
  rewriteStatus: RewriteStatus
  exitCode?: number
}

class ShellExecutionError extends Error {
  constructor(message: string, readonly metadata: ShellMetadata) {
    super(message)
    this.name = "ShellExecutionError"
  }
}

export async function executeShell(
  originalCommand: string,
  root: string,
  signal: AbortSignal,
  dependencies: ShellDependencies = {}
): Promise<AdapterResult> {
  assertForeground(originalCommand)
  if (invokesRtk(originalCommand) && !isRewriteEligible(originalCommand)) {
    throw new Error("compound or environment-mutating RTK commands are not supported")
  }
  const rewrite = await rewriteCommand(originalCommand, root, signal, dependencies)
  if (signal.aborted) throw abortError()

  const environment = invokesRtk(rewrite.command)
    ? isolatedRtkEnvironment(dependencies.environment ?? process.env)
    : dependencies.environment

  try {
    if (signal.aborted) throw abortError()
    const process = Bun.spawn([dependencies.shellExecutable ?? "/bin/sh", "-lc", rewrite.command], {
      cwd: root,
      env: environment,
      stdout: "pipe",
      stderr: "pipe",
    })
    const result = await collectProcess(process, signal, MAX_OUTPUT_CHARS)
    const metadata = shellMetadata(originalCommand, rewrite, result.exitCode)
    if (result.exitCode !== 0) {
      throw new ShellExecutionError(result.stderr || result.stdout || `shell exited ${result.exitCode}`, metadata)
    }
    return {
      output: result.stdout || result.stderr || "Command completed.",
      metadata,
    }
  } catch (error) {
    if (signal.aborted) throw abortError()
    if (error instanceof ShellExecutionError) throw error
    throw new ShellExecutionError(errorMessage(error), shellMetadata(originalCommand, rewrite))
  }
}

async function rewriteCommand(
  command: string,
  root: string,
  signal: AbortSignal,
  dependencies: ShellDependencies
): Promise<RewriteDecision> {
  if (hasRtkDisabled(command)) return { command, status: "disabled" }
  if (invokesRtk(command)) return { command, status: "already-rtk" }
  if (!isRewriteEligible(command)) return { command, status: "ineligible" }
  if (signal.aborted) throw abortError()

  const timeout = new AbortController()
  const timeoutHandle = setTimeout(() => timeout.abort(), dependencies.rewriteTimeoutMs ?? REWRITE_TIMEOUT_MS)
  try {
    const process = Bun.spawn([dependencies.rtkExecutable ?? "rtk", "rewrite", command], {
      cwd: root,
      env: isolatedRtkEnvironment({
        ...globalThis.process.env,
        ...dependencies.environment,
      }),
      stdout: "pipe",
      stderr: "pipe",
    })
    const result = await collectProcess(process, AbortSignal.any([signal, timeout.signal]), MAX_REWRITE_CHARS)
    if (result.stdoutTruncated || result.stderrTruncated) return { command, status: "failed" }
    if (result.exitCode === 1) return { command, status: "exit-1" }
    if (result.exitCode === 2) return { command, status: "exit-2" }
    if (result.exitCode !== 0 && result.exitCode !== 3) return { command, status: "failed" }

    const rewritten = result.stdout.trim()
    if (!rewritten || rewritten === command) return { command, status: "unchanged" }
    if (!isSafeRewrittenCommand(rewritten)) return { command, status: "failed" }
    return { command: rewritten, status: result.exitCode === 3 ? "rewritten-ask" : "rewritten" }
  } catch (error) {
    if (signal.aborted) throw abortError()
    if (timeout.signal.aborted) return { command, status: "timeout" }
    return { command, status: isMissingExecutable(error) ? "unavailable" : "failed" }
  } finally {
    clearTimeout(timeoutHandle)
  }
}

function assertForeground(command: string): void {
  if (/(^|[^&])&($|[^&])|\b(?:nohup|disown)\b/.test(command)) {
    throw new Error("background shell execution is not supported")
  }
}

function hasRtkDisabled(command: string): boolean {
  return /(?:^|[\s;&|()])RTK_DISABLED=1(?:$|[\s;&|()])/.test(command)
}

function invokesRtk(command: string): boolean {
  return /(?:^|[\s;&|()])(?:[^\s;&|()]*(?:\/|\\))?rtk(?:$|[\s;&|()])/.test(command)
}

function isRewriteEligible(command: string): boolean {
  if (/[;&|<>()`\n\r]/.test(command)) return false
  if (/\$\(/.test(command)) return false
  if (/^\s*[A-Za-z_][A-Za-z0-9_]*\s*=/.test(command)) return false
  if (/(?:^|\s)(?:env|eval|exec|export|set|source|unset|bash|sh|zsh)(?:\s|$)/.test(command)) return false
  return !/(?:^|[^A-Za-z0-9_])(?:RTK_DB_PATH|RTK_TEE_DIR|RTK_TEE|RTK_TELEMETRY_DISABLED)\s*=/.test(command)
}

function isSafeRewrittenCommand(command: string): boolean {
  return /^\s*rtk(?:\s|$)/.test(command) && isRewriteEligible(command)
}

function isolatedRtkEnvironment(
  environment: Record<string, string | undefined>
): Record<string, string | undefined> {
  return {
    ...environment,
    RTK_TEE: "0",
    RTK_TELEMETRY_DISABLED: "1",
    RTK_DB_PATH: "/dev/null",
    RTK_TEE_DIR: "/dev/null",
  }
}

function shellMetadata(original: string, rewrite: RewriteDecision, exitCode?: number): ShellMetadata {
  return {
    originalCommand: boundedCommand(original),
    executedCommand: boundedCommand(rewrite.command),
    rewriteStatus: rewrite.status,
    ...(exitCode === undefined ? {} : { exitCode }),
  }
}

function boundedCommand(command: string): string {
  if (command.length <= MAX_METADATA_COMMAND_CHARS) return command
  const marker = "… truncated"
  return `${command.slice(0, MAX_METADATA_COMMAND_CHARS - marker.length)}${marker}`
}

async function collectProcess(
  process: {
    stdout: ReadableStream<Uint8Array>
    stderr: ReadableStream<Uint8Array>
    exited: Promise<number>
    kill(): void
  },
  signal: AbortSignal,
  maximum: number
): Promise<ProcessResult> {
  if (signal.aborted) {
    process.kill()
    throw abortError()
  }
  const abort = () => process.kill()
  signal.addEventListener("abort", abort, { once: true })
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      readBoundedStream(process.stdout, maximum),
      readBoundedStream(process.stderr, maximum),
      process.exited,
    ])
    if (signal.aborted) throw abortError()
    return {
      stdout: stdout.output,
      stderr: stderr.output,
      exitCode,
      stdoutTruncated: stdout.truncated,
      stderrTruncated: stderr.truncated,
    }
  } finally {
    signal.removeEventListener("abort", abort)
  }
}

async function readBoundedStream(
  stream: ReadableStream<Uint8Array>,
  maximum: number
): Promise<{ output: string; truncated: boolean }> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let output = ""
  let truncated = false
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    const decoded = decoder.decode(chunk.value, { stream: true })
    if (output.length + decoded.length > maximum) truncated = true
    if (output.length < maximum) output += decoded.slice(0, maximum - output.length)
  }
  const tail = decoder.decode()
  if (output.length + tail.length > maximum) truncated = true
  if (output.length < maximum) output += tail.slice(0, maximum - output.length)
  return { output, truncated }
}

function isMissingExecutable(error: unknown): boolean {
  const value = error as { code?: unknown; message?: unknown }
  return value?.code === "ENOENT" || String(value?.message ?? "").toLowerCase().includes("executable not found")
}

function abortError(): DOMException {
  return new DOMException("Command aborted", "AbortError")
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
