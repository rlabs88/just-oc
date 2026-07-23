import { COMMAND_TYPES, type CommandInput, type ParsedCommand } from "./types"

const COMMAND_KEYS = new Set(["command_type", "command_line", "step"])

export function parseCommands(value: unknown): ParsedCommand[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) {
    throw new Error("commands must contain between 1 and 20 items")
  }

  return value.map((item, inputIndex) => parseCommand(item, inputIndex))
}

function parseCommand(value: unknown, inputIndex: number): ParsedCommand {
  if (!isRecord(value)) throw new Error(`commands[${inputIndex}] must be an object`)
  const unknownKey = Object.keys(value).find((key) => !COMMAND_KEYS.has(key))
  if (unknownKey) throw new Error(`commands[${inputIndex}] has unknown field: ${unknownKey}`)
  if (!COMMAND_TYPES.includes(value.command_type as CommandInput["command_type"])) {
    throw new Error(`commands[${inputIndex}] has unsupported command_type`)
  }
  if (typeof value.command_line !== "string" || value.command_line.trim() === "") {
    throw new Error(`commands[${inputIndex}].command_line must be non-empty`)
  }
  if (!Number.isInteger(value.step) || (value.step as number) < 1) {
    throw new Error(`commands[${inputIndex}].step must be a positive integer`)
  }
  return { ...(value as CommandInput), inputIndex }
}

export function parseStrictObject(
  command: ParsedCommand,
  allowedKeys: readonly string[]
): Record<string, unknown> {
  let value: unknown
  try {
    value = JSON.parse(command.command_line)
  } catch {
    throw new Error(`${command.command_type} command_line must be a JSON object`)
  }
  if (!isRecord(value)) throw new Error(`${command.command_type} command_line must be a JSON object`)
  const allowed = new Set(allowedKeys)
  const unknownKey = Object.keys(value).find((key) => !allowed.has(key))
  if (unknownKey) throw new Error(`${command.command_type} has unknown field: ${unknownKey}`)
  return value
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} must be a non-empty string`)
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
