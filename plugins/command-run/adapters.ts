import { stat } from "node:fs/promises"
import { join, relative } from "node:path"
import type { ParsedCommand, AdapterResult, ExecutionClass, TaskCheckpoint } from "./types"
import { parseStrictObject, requireString } from "./parser"
import { resolveWorkspacePath } from "./paths"
import { executeReadMedia, parseMediaRequest } from "./media"
import { executeWebDiscover, parseWebRequest, validateWebPermission, type WebDependencies } from "./web"
import { executeShell } from "./shell"

const MAX_READ_CHARS = 40_000
const MAX_MATCHES = 200

export async function permissionPatterns(command: ParsedCommand, root: string, webDependencies: WebDependencies = {}): Promise<string[]> {
  if (command.command_type === "shell") return [command.command_line]
  if (command.command_type === "apply_patch") {
    return Promise.all(patchPaths(command.command_line).map((path) => resolveWorkspacePath(root, path)))
  }
  if (command.command_type === "task_status") return ["task_status"]
  if (command.command_type === "web_discover") return validateWebPermission(command, root, webDependencies)
  if (command.command_type === "read_media") {
    const request = parseMediaRequest(command)
    return [await resolveWorkspacePath(root, request.path)]
  }
  const parsed = parseAdapterObject(command)
  const requestedPath = typeof parsed.path === "string" ? parsed.path : "."
  return [await resolveWorkspacePath(root, requestedPath)]
}

export async function executeAdapter(
  command: ParsedCommand,
  root: string,
  signal: AbortSignal,
  webDependencies: WebDependencies = {}
): Promise<AdapterResult> {
  switch (command.command_type) {
    case "read": return executeRead(command, root)
    case "glob": return executeGlob(command, root)
    case "grep": return executeGrep(command, root, signal)
    case "apply_patch": return executePatch(command, root, signal)
    case "shell": return executeShell(command.command_line, root, signal)
    case "task_status": return executeTaskStatus(command)
    case "web_discover": return executeWebDiscover(command, root, signal, webDependencies)
    case "read_media": return executeReadMedia(command, root)
  }
}

export function executionClass(command: ParsedCommand): ExecutionClass {
  if (command.command_type === "web_discover") {
    return parseWebRequest(command).mode === "extract" ? "parallel-read" : "mutation"
  }
  if (command.command_type === "read_media") return "exclusive-read"
  if (command.command_type === "read" || command.command_type === "glob" || command.command_type === "grep" || command.command_type === "task_status") {
    return "parallel-read"
  }
  return "mutation"
}

function parseAdapterObject(command: ParsedCommand): Record<string, unknown> {
  switch (command.command_type) {
    case "read": return parseStrictObject(command, ["path", "offset", "limit"])
    case "glob": return parseStrictObject(command, ["pattern", "path"])
    case "grep": return parseStrictObject(command, ["pattern", "path", "include"])
    case "task_status": return parseStrictObject(command, ["task_group", "task_type", "status", "compact_context"])
    default: throw new Error(`${command.command_type} does not use JSON command_line`)
  }
}

async function executeRead(command: ParsedCommand, root: string): Promise<AdapterResult> {
  const parsed = parseAdapterObject(command)
  const path = await resolveWorkspacePath(root, requireString(parsed.path, "path"))
  const canonicalRoot = await resolveWorkspacePath(root, ".")
  const fileInfo = await stat(path)
  if (!fileInfo.isFile()) throw new Error("read path must be a file")
  const offset = optionalInteger(parsed.offset, "offset", 0, 1_000_000)
  const limit = optionalInteger(parsed.limit, "limit", 1, 2_000) ?? 500
  const lines = (await Bun.file(path).text()).split("\n").slice(offset ?? 0, (offset ?? 0) + limit)
  return { output: lines.join("\n").slice(0, MAX_READ_CHARS), metadata: { path: relative(canonicalRoot, path), offset: offset ?? 0, lines: lines.length } }
}

async function executeGlob(command: ParsedCommand, root: string): Promise<AdapterResult> {
  const parsed = parseAdapterObject(command)
  const pattern = requireString(parsed.pattern, "pattern")
  const base = await resolveWorkspacePath(root, typeof parsed.path === "string" ? parsed.path : ".")
  const canonicalRoot = await resolveWorkspacePath(root, ".")
  if (!(await stat(base)).isDirectory()) throw new Error("glob path must be a directory")
  const matches: string[] = []
  for await (const match of new Bun.Glob(pattern).scan({ cwd: base, dot: true, onlyFiles: false })) {
    await resolveWorkspacePath(root, `${relative(root, base)}/${match}`)
    matches.push(relative(canonicalRoot, join(base, match)))
    if (matches.length >= MAX_MATCHES) break
  }
  matches.sort()
  return { output: matches.join("\n") || "No matches.", metadata: { matches: matches.length, truncated: matches.length === MAX_MATCHES } }
}

async function executeGrep(command: ParsedCommand, root: string, signal: AbortSignal): Promise<AdapterResult> {
  const parsed = parseAdapterObject(command)
  const pattern = requireString(parsed.pattern, "pattern")
  const path = await resolveWorkspacePath(root, typeof parsed.path === "string" ? parsed.path : ".")
  const args = ["rg", "--line-number", "--no-heading", "--color", "never"]
  if (parsed.include !== undefined) args.push("--glob", requireString(parsed.include, "include"))
  args.push("--", pattern, path)
  const process = Bun.spawn(args, { cwd: root, stdout: "pipe", stderr: "pipe" })
  const result = await collectProcess(process, signal)
  if (result.exitCode !== 0 && result.exitCode !== 1) throw new Error(result.stderr || `rg exited ${result.exitCode}`)
  return { output: result.stdout || "No matches.", metadata: { matched: result.exitCode === 0 } }
}

async function executePatch(command: ParsedCommand, root: string, signal: AbortSignal): Promise<AdapterResult> {
  const paths = patchPaths(command.command_line)
  if (paths.length === 0) throw new Error("apply_patch requires unified diff file headers")
  for (const path of paths) await resolveWorkspacePath(root, path)
  const check = Bun.spawn(["git", "apply", "--check", "--whitespace=nowarn", "-"], { cwd: root, stdin: "pipe", stdout: "pipe", stderr: "pipe" })
  check.stdin.write(command.command_line)
  check.stdin.end()
  const checked = await collectProcess(check, signal)
  if (checked.exitCode !== 0) throw new Error(checked.stderr || "patch validation failed")
  const apply = Bun.spawn(["git", "apply", "--whitespace=nowarn", "-"], { cwd: root, stdin: "pipe", stdout: "pipe", stderr: "pipe" })
  apply.stdin.write(command.command_line)
  apply.stdin.end()
  const applied = await collectProcess(apply, signal)
  if (applied.exitCode !== 0) throw new Error(applied.stderr || "patch application failed")
  return { output: `Applied patch to ${paths.length} path(s).`, metadata: { paths } }
}

function executeTaskStatus(command: ParsedCommand): AdapterResult {
  const parsed = parseAdapterObject(command)
  const status = parsed.status
  if (status !== "doing" && status !== "question" && status !== "done") {
    throw new Error("status must be doing, question, or done")
  }
  const taskType = parsed.task_type
  if (!isTaskType(taskType)) throw new Error("task_type is not supported")
  const checkpoint: TaskCheckpoint = {
    version: 1,
    task_group: boundedString(parsed.task_group, "task_group", 200),
    task_type: taskType,
    status,
    compact_context: boundedString(parsed.compact_context, "compact_context", 4_000),
  }
  return { output: JSON.stringify(checkpoint), metadata: { taskStatus: checkpoint } }
}

function boundedString(value: unknown, field: string, maximum: number): string {
  const text = requireString(value, field)
  if (text.length > maximum) throw new Error(`${field} must be at most ${maximum} characters`)
  return text
}

function isTaskType(value: unknown): value is TaskCheckpoint["task_type"] {
  return value === "implementation"
    || value === "debugging"
    || value === "architecture"
    || value === "review"
    || value === "research"
    || value === "visual_inspection"
}

function patchPaths(diff: string): string[] {
  const paths = [...diff.matchAll(/^(?:---|\+\+\+)\s+(?:[ab]\/)?([^\t\n]+)$/gm)]
    .map((match) => match[1])
    .filter((path) => path !== "/dev/null")
  for (const path of paths) {
    if (path.startsWith("/") || path.split("/").includes("..")) throw new Error(`patch path escapes workspace: ${path}`)
  }
  return [...new Set(paths)]
}

function optionalInteger(value: unknown, field: string, minimum: number, maximum: number): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${field} must be an integer between ${minimum} and ${maximum}`)
  }
  return value as number
}

async function collectProcess(
  process: {
    stdout: ReadableStream<Uint8Array>
    stderr: ReadableStream<Uint8Array>
    exited: Promise<number>
    kill(): void
  },
  signal: AbortSignal
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const abort = () => process.kill()
  signal.addEventListener("abort", abort, { once: true })
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      readBoundedStream(process.stdout),
      readBoundedStream(process.stderr),
      process.exited,
    ])
    if (signal.aborted) throw new DOMException("Command aborted", "AbortError")
    return { stdout, stderr, exitCode }
  } finally {
    signal.removeEventListener("abort", abort)
  }
}

async function readBoundedStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let output = ""
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    if (output.length < MAX_READ_CHARS) {
      output += decoder.decode(chunk.value, { stream: true }).slice(0, MAX_READ_CHARS - output.length)
    }
  }
  return output + decoder.decode().slice(0, Math.max(0, MAX_READ_CHARS - output.length))
}
