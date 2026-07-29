/**
 * Structured contract for a divergent-ideation run.
 *
 * Ported from the ADHD method (UditAkhourii/adhd, MIT). The shape is part of the
 * contract Flux is written against: it sorts, filters, and disagrees with this
 * result rather than relaying prose, so the field set is not ours to trim.
 */

export type Idea = {
  id: string
  frameId: string
  cluster?: string
  /** One phrase or sentence. Paragraphs mean the generator drifted into prose. */
  text: string
  rationale?: string
  score?: Score
  /** 0 = root divergence, 1+ = surfaced while deepening. */
  depth: number
  parentId?: string
}

export type Score = {
  /** Distance from the obvious default. */
  novelty: number
  /** Could it actually ship. */
  viability: number
  /** Does it address the stated problem. */
  fit: number
  /** Weighted total; viability gates, novelty is the point. */
  total: number
  /** Present only when the idea is attractive but carries a hidden cost. */
  trap?: string
  /** Required for every idea — the concrete thing it gets right that rivals do not. */
  strength?: string
}

export type Branch = {
  frameId: string
  frameLabel: string
  ideas: Idea[]
  /** Set when the branch dispatch failed or returned unusable output. */
  failed?: string
}

export type Cluster = {
  label: string
  ideaIds: string[]
}

export type DeepenedIdea = {
  ideaId: string
  /** 4-8 sentences: how it works, the load-bearing risk, the first concrete step. */
  sketch: string
  childIdeas: Idea[]
}

export type RunResult = {
  problem: string
  reframe?: string
  branches: Branch[]
  clusters: Cluster[]
  shortlist: Idea[]
  nonObviousPick: Idea | null
  traps: Idea[]
  deepened: DeepenedIdea[]
  provocation: string
  /**
   * Set when the critic trapped every candidate and the ranking had to fall back
   * to including trapped ideas. The shortlist is still real, but every entry
   * carries a flagged cost — read `traps` before acting on it.
   */
  trapFallback?: boolean
}

export type RunOptions = {
  problem: string
  /** Code, constraints, and stack — kept out of the problem statement so it does not anchor every branch. */
  context?: string
  framesPerRun?: number
  ideasPerFrame?: number
  topK?: number
  concurrency?: number
  /** Bias frame selection toward engineering vantages. */
  codeMode?: boolean
  /** Strip incidental anchors before fan-out; real constraints are preserved. */
  stripAnchors?: boolean
  /** Agent the branch dispatches run as. */
  agent?: string
  /** Model for the generator passes. */
  model?: { providerID: string; modelID: string }
  /** Model for the critic passes (score + cluster). A different family decorrelates critic error. */
  criticModel?: { providerID: string; modelID: string }
  onEvent?: (event: RunEvent) => void
}

export type RunEvent =
  | { kind: "reframe:done"; changed: boolean }
  | { kind: "frame:start"; frameId: string; frameLabel: string }
  | { kind: "frame:done"; frameId: string; count: number }
  | { kind: "frame:failed"; frameId: string; reason: string }
  | { kind: "score:done"; total: number }
  | { kind: "trap:fallback"; trapped: number }
  | { kind: "cluster:done"; clusters: number }
  | { kind: "deepen:start"; ideaId: string; text: string }
  | { kind: "deepen:done"; ideaId: string }
  | { kind: "deepen:failed"; ideaId: string; reason: string }

/** Weights: novelty is the point, viability is the gatekeeper. */
export const SCORE_WEIGHTS = { novelty: 0.35, viability: 0.4, fit: 0.25 } as const

export const DEFAULTS = {
  framesPerRun: 5,
  ideasPerFrame: 6,
  topK: 3,
  concurrency: 4,
  codeMode: true,
  stripAnchors: true,
} as const
