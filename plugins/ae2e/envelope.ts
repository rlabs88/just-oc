/**
 * The lifecycle envelope the coordinator sends and this policy consumes.
 *
 * Three properties carry the safety of the whole bundle, so all three are
 * checked here rather than trusted upstream:
 *
 * **Versioned.** An envelope without the exact marker and version is not an
 * envelope. There is no best-effort read of a near-miss.
 *
 * **Generation-stamped.** Lifecycle delivery is at-least-once, so every envelope
 * carries the generation it speaks for and the core dedupes on it.
 *
 * **Origin-restricted.** Acceptance needs two independent facts: the envelope
 * arrived on a `user`-role message, which an assistant structurally cannot
 * author, and its part declares control-plane origin in part metadata, which
 * only a programmatic caller can set. Text alone is never enough — that is what
 * stops a session self-authorizing AE2E by printing an envelope.
 *
 * Parsing is total and pure: every failure returns `null`, and nothing is ever
 * partially applied.
 */

import type { PolicyEvent } from "./policy"
import { DEFAULT_RESUME_CEILING, DEFAULT_VALIDATION_ATTEMPTS } from "./policy"

export const ENVELOPE_MARKER = "ae2e.lifecycle"
export const ENVELOPE_VERSION = 1

/** Part-metadata key and value that declare control-plane origin. */
export const ORIGIN_METADATA_KEY = "ae2e.origin"
export const CONTROL_PLANE_ORIGIN = "control-plane"

export type EnvelopeKind =
  | "kickoff"
  | "children_registered"
  | "children_resolved"
  | "external_halt"
  | "external_resolved"
  | "deliverable_ready"
  | "validation_passed"
  | "validation_failed"
  | "fence_applied"
  | "cancel"

const KINDS: readonly EnvelopeKind[] = [
  "kickoff",
  "children_registered",
  "children_resolved",
  "external_halt",
  "external_resolved",
  "deliverable_ready",
  "validation_passed",
  "validation_failed",
  "fence_applied",
  "cancel",
]

export type LifecycleEnvelope = {
  readonly marker: typeof ENVELOPE_MARKER
  readonly version: typeof ENVELOPE_VERSION
  readonly kind: EnvelopeKind
  readonly generation: number
  readonly issue: string
  readonly arp?: "AE2E"
  readonly validationContract?: string
  readonly resumeCeiling?: number
  readonly validationAttempts?: number
  readonly children?: readonly string[]
  readonly reason?: string
  readonly context?: string
  readonly publishUrl?: string
}

/** The shape the binding reads out of a host message part. */
export type EnvelopeCarrier = {
  readonly type?: string
  readonly text?: string | null
  readonly metadata?: Record<string, unknown> | null
  readonly synthetic?: boolean | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString)
}

/**
 * Parse envelope text.
 *
 * The text part must be the envelope and nothing else. Prose wrapped around a
 * JSON object is rejected rather than scanned, because a scanner is exactly the
 * surface that lets model-authored text become an instruction.
 */
export function parseEnvelope(text: string): LifecycleEnvelope | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(raw)) return null

  if (raw.marker !== ENVELOPE_MARKER) return null
  if (raw.version !== ENVELOPE_VERSION) return null

  const kind = raw.kind
  if (typeof kind !== "string" || !KINDS.includes(kind as EnvelopeKind)) return null

  const generation = raw.generation
  if (!Number.isSafeInteger(generation) || (generation as number) < 0) return null

  if (!isNonEmptyString(raw.issue)) return null

  // Built field by field. `raw` is never spread, so an unrecognised key on the
  // wire cannot reach the core.
  const base = {
    marker: ENVELOPE_MARKER,
    version: ENVELOPE_VERSION,
    kind: kind as EnvelopeKind,
    generation: generation as number,
    issue: raw.issue,
  } as const

  switch (base.kind) {
    case "kickoff": {
      if (raw.arp !== "AE2E") return null
      if (!isNonEmptyString(raw.validationContract)) return null
      if (raw.resumeCeiling !== undefined && !isPositiveInteger(raw.resumeCeiling)) return null
      if (raw.validationAttempts !== undefined && !isPositiveInteger(raw.validationAttempts))
        return null
      if (raw.publishUrl !== undefined && !isNonEmptyString(raw.publishUrl)) return null
      return {
        ...base,
        arp: "AE2E",
        validationContract: raw.validationContract,
        resumeCeiling: (raw.resumeCeiling as number | undefined) ?? DEFAULT_RESUME_CEILING,
        validationAttempts:
          (raw.validationAttempts as number | undefined) ?? DEFAULT_VALIDATION_ATTEMPTS,
        ...(isNonEmptyString(raw.publishUrl) ? { publishUrl: raw.publishUrl } : {}),
      }
    }

    case "children_registered": {
      if (!isStringArray(raw.children)) return null
      return { ...base, children: [...raw.children] }
    }

    case "external_halt": {
      if (!isNonEmptyString(raw.reason)) return null
      return { ...base, reason: raw.reason }
    }

    case "children_resolved":
    case "external_resolved": {
      // Resume must carry something into the session; a contextless resume is
      // an unexplained new turn.
      if (!isNonEmptyString(raw.context)) return null
      return { ...base, context: raw.context }
    }

    default:
      return base
  }
}

/** Only a `user`-role message part bearing the control-plane metadata marker. */
export function isControlPlaneOrigin(role: string, part: EnvelopeCarrier): boolean {
  if (role !== "user") return false
  if (part.type !== "text") return false
  const metadata = part.metadata
  if (!isRecord(metadata)) return false
  return metadata[ORIGIN_METADATA_KEY] === CONTROL_PLANE_ORIGIN
}

/** Read every envelope a message legitimately carries, in wire order. */
export function readEnvelopes(
  role: string,
  parts: readonly EnvelopeCarrier[],
): LifecycleEnvelope[] {
  const envelopes: LifecycleEnvelope[] = []
  for (const part of parts) {
    if (!isControlPlaneOrigin(role, part)) continue
    if (typeof part.text !== "string") continue
    const envelope = parseEnvelope(part.text)
    if (envelope) envelopes.push(envelope)
  }
  return envelopes
}

/**
 * Map an envelope onto a core event.
 *
 * `kickoff` is absent: activation needs the frozen kickoff record, which the
 * registry builds, so it is mapped there rather than here.
 */
export function toPolicyEvent(envelope: LifecycleEnvelope): PolicyEvent | null {
  const generation = envelope.generation
  switch (envelope.kind) {
    case "children_registered":
      return { type: "children_registered", generation, children: envelope.children ?? [] }
    case "external_halt":
      return { type: "external_halt", generation, reason: envelope.reason ?? "" }
    case "children_resolved":
      return { type: "children_resolved", generation, context: envelope.context ?? "" }
    case "external_resolved":
      return { type: "external_resolved", generation, context: envelope.context ?? "" }
    case "deliverable_ready":
      return { type: "deliverable_ready", generation }
    case "validation_passed":
      return { type: "validation_passed", generation }
    case "validation_failed":
      return { type: "validation_failed", generation }
    case "fence_applied":
      return { type: "fence_applied", generation }
    case "cancel":
      return { type: "cancelled", generation }
    case "kickoff":
      return null
  }
}
