/**
 * Structured-output parsing for model responses.
 *
 * Validation is hand-written rather than schema-library driven so each phase can
 * choose its own failure posture explicitly. The postures are not uniform and
 * that is deliberate:
 *
 *   - reframe fails open — a broken anchor strip should fan out from the original
 *     problem, not abort the run;
 *   - divergence fails per branch — one dead vantage is a narrower run, not a
 *     dead one;
 *   - scoring fails closed — a partial score set silently changes the ranking,
 *     which is the one output a caller cannot detect as wrong.
 */

/** Strip fences and any preamble the model added despite instructions. */
export function extractJSON(raw: string): unknown {
  let text = raw.trim()

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced?.[1]) text = fenced[1].trim()

  const firstObject = text.indexOf("{")
  const firstArray = text.indexOf("[")
  const start =
    firstObject === -1
      ? firstArray
      : firstArray === -1
        ? firstObject
        : Math.min(firstObject, firstArray)
  if (start > 0) text = text.slice(start)

  return JSON.parse(text)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`expected non-empty string at "${field}"`)
  }
  return value
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== "string") throw new Error(`expected string at "${field}"`)
  const trimmed = value.trim()
  return trimmed === "" ? undefined : trimmed
}

function requireScoreAxis(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 10) {
    throw new Error(`expected number 0-10 at "${field}"`)
  }
  return value
}

export type DivergeRow = { text: string; rationale?: string }

export function parseDivergeRows(raw: string): DivergeRow[] {
  const parsed = extractJSON(raw)
  if (!Array.isArray(parsed)) throw new Error("expected a JSON array of ideas")
  return parsed.map((row, index) => {
    if (!isRecord(row)) throw new Error(`expected an object at index ${index}`)
    return {
      text: requireString(row.text, `[${index}].text`),
      rationale: optionalString(row.rationale, `[${index}].rationale`),
    }
  })
}

export type ScoreRow = {
  id: string
  novelty: number
  viability: number
  fit: number
  trap?: string
  strength?: string
}

export function parseScoreRows(raw: string): ScoreRow[] {
  const parsed = extractJSON(raw)
  if (!Array.isArray(parsed)) throw new Error("expected a JSON array of scores")
  return parsed.map((row, index) => {
    if (!isRecord(row)) throw new Error(`expected an object at index ${index}`)
    return {
      id: requireString(row.id, `[${index}].id`),
      novelty: requireScoreAxis(row.novelty, `[${index}].novelty`),
      viability: requireScoreAxis(row.viability, `[${index}].viability`),
      fit: requireScoreAxis(row.fit, `[${index}].fit`),
      trap: optionalString(row.trap, `[${index}].trap`),
      // The critic owes a strength for every idea, but a missing one is not
      // worth failing a run over — the ranking does not read it.
      strength: optionalString(row.strength, `[${index}].strength`),
    }
  })
}

export type ClusterRow = { label: string; ideaIds: string[] }

export function parseClusterRows(raw: string): ClusterRow[] {
  const parsed = extractJSON(raw)
  if (!Array.isArray(parsed)) throw new Error("expected a JSON array of clusters")
  return parsed.map((row, index) => {
    if (!isRecord(row)) throw new Error(`expected an object at index ${index}`)
    const ideaIds = row.ideaIds
    if (!Array.isArray(ideaIds)) throw new Error(`expected an array at "[${index}].ideaIds"`)
    return {
      label: requireString(row.label, `[${index}].label`),
      ideaIds: ideaIds.map((id, position) =>
        requireString(id, `[${index}].ideaIds[${position}]`),
      ),
    }
  })
}

export type DeepenPayload = { sketch: string; childIdeas: DivergeRow[] }

export function parseDeepenPayload(raw: string): DeepenPayload {
  const parsed = extractJSON(raw)
  if (!isRecord(parsed)) throw new Error("expected a JSON object")
  const childIdeas = parsed.childIdeas
  if (!Array.isArray(childIdeas)) throw new Error('expected an array at "childIdeas"')
  return {
    sketch: requireString(parsed.sketch, "sketch"),
    childIdeas: childIdeas.map((row, index) => {
      if (!isRecord(row)) throw new Error(`expected an object at "childIdeas[${index}]"`)
      return {
        text: requireString(row.text, `childIdeas[${index}].text`),
        rationale: optionalString(row.rationale, `childIdeas[${index}].rationale`),
      }
    }),
  }
}

export type ReframePayload = { reframed: string; changed: boolean }

export function parseReframePayload(raw: string): ReframePayload {
  const parsed = extractJSON(raw)
  if (!isRecord(parsed)) throw new Error("expected a JSON object")
  return {
    reframed: requireString(parsed.reframed, "reframed"),
    changed: parsed.changed === true,
  }
}
