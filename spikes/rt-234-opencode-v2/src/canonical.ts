import { createHash } from "node:crypto"

export function normalizeInput<T>(value: T): T {
  if (typeof value === "string") return normalizeString(value) as T
  if (Array.isArray(value)) return value.map(normalizeInput) as T
  if (!isRecord(value)) return value

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, normalizeInput(item)]),
  ) as T
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value))
}

export function sha256(value: unknown): string {
  const bytes = typeof value === "string" ? value : canonicalJson(value)
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`
}

function normalizeString(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim()
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (!isRecord(value)) return value

  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, sortValue(value[key])]),
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
