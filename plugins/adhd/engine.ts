/**
 * Divergent-ideation engine.
 *
 * Ported from the ADHD method (UditAkhourii/adhd, MIT). The loop:
 *   0. Reframe  — strip incidental anchors from the problem statement.
 *   1. Diverge  — fan out N isolated branches, one cognitive frame each, no critic.
 *   2. Score + cluster — the critic comes back online over the whole pool.
 *   3. Deepen   — prune to top K and expand those.
 *
 * Convergence happens after divergence, never during. The phase wall is why the
 * engine awaits a whole phase before starting the next one, and it is the reason
 * this cannot be expressed as a chain of independent dispatches.
 *
 * The engine never calls a provider. It is handed a `dispatch` and every call
 * goes through it, so branches are OpenCode sessions under the host's
 * permissions, auth, and session graph.
 */

import { randomUUID } from "node:crypto"
import { selectFrames, type Frame } from "./frames"
import { createLimiter } from "./limit"
import {
  parseClusterRows,
  parseDeepenPayload,
  parseDivergeRows,
  parseReframePayload,
  parseScoreRows,
} from "./parse"
import {
  CLUSTER_SYSTEM,
  DEEPEN_SYSTEM,
  DIVERGE_SYSTEM,
  REFRAME_SYSTEM,
  SCORE_SYSTEM,
} from "./prompts"
import {
  DEFAULTS,
  SCORE_WEIGHTS,
  type Branch,
  type Cluster,
  type DeepenedIdea,
  type Idea,
  type RunOptions,
  type RunResult,
  type Score,
} from "./types"

export type DispatchInput = {
  title: string
  system: string
  prompt: string
  model?: { providerID: string; modelID: string }
}

export type BranchDispatch = (input: DispatchInput) => Promise<string>

function problemBlock(problem: string, context?: string): string {
  return `PROBLEM:\n${problem}\n\n${context ? `CONTEXT:\n${context}\n\n` : ""}`
}

async function reframeProblem(
  dispatch: BranchDispatch,
  problem: string,
  context: string | undefined,
  model: { providerID: string; modelID: string } | undefined,
): Promise<{ reframed: string; changed: boolean }> {
  try {
    const raw = await dispatch({
      title: "adhd: reframe",
      system: REFRAME_SYSTEM,
      prompt: `${problemBlock(problem, context)}Strip incidental anchors, keep real constraints. Output JSON only.`,
      model,
    })
    const parsed = parseReframePayload(raw)
    return { reframed: parsed.reframed, changed: parsed.changed }
  } catch {
    // Fails open — a broken anchor strip fans out from the original problem.
    return { reframed: problem, changed: false }
  }
}

/**
 * Build one divergent branch's brief.
 *
 * Exported because the isolation invariant is asserted against it: the brief
 * carries the problem, the caller's context, and this frame — and nothing
 * produced by a sibling branch.
 */
export function buildDivergeBrief(
  problem: string,
  context: string | undefined,
  frame: Frame,
  ideasPerFrame: number,
): string {
  return `${problemBlock(problem, context)}FRAME — ${frame.label}:
${frame.prompt}

Generate ${ideasPerFrame} ideas under this frame.
Output JSON array: [{"text": "...", "rationale": "..."}]
- text: one phrase or sentence, the idea itself
- rationale: 1 short clause on why this frame surfaces it (optional)`
}

async function divergeBranch(
  dispatch: BranchDispatch,
  problem: string,
  context: string | undefined,
  frame: Frame,
  ideasPerFrame: number,
  model: { providerID: string; modelID: string } | undefined,
): Promise<Branch> {
  try {
    const raw = await dispatch({
      title: `adhd: diverge — ${frame.label}`,
      system: DIVERGE_SYSTEM,
      prompt: buildDivergeBrief(problem, context, frame, ideasPerFrame),
      model,
    })
    const rows = parseDivergeRows(raw)
    return {
      frameId: frame.id,
      frameLabel: frame.label,
      ideas: rows.map((row) => ({
        id: randomUUID(),
        frameId: frame.id,
        text: row.text,
        rationale: row.rationale,
        depth: 0,
      })),
    }
  } catch (error) {
    // Fails per branch — one dead vantage narrows the run, it does not end it.
    return {
      frameId: frame.id,
      frameLabel: frame.label,
      ideas: [],
      failed: error instanceof Error ? error.message : String(error),
    }
  }
}

async function scoreIdeas(
  dispatch: BranchDispatch,
  problem: string,
  ideas: Idea[],
  model: { providerID: string; modelID: string } | undefined,
): Promise<Map<string, Score>> {
  if (ideas.length === 0) return new Map()

  const raw = await dispatch({
    title: "adhd: score",
    system: SCORE_SYSTEM,
    prompt: `PROBLEM:
${problem}

IDEAS (id → text):
${ideas.map((idea) => `${idea.id} :: ${idea.text}`).join("\n")}

Score each. Output a JSON array.

The normal row has no "trap" key at all — omit it entirely rather than writing an
empty or hedging value. Add "trap" only for the rare idea whose attractiveness is
itself the hazard.

[{"id":"...","novelty":0-10,"viability":0-10,"fit":0-10,"strength":"..."},
 {"id":"...","novelty":0-10,"viability":0-10,"fit":0-10,"strength":"...","trap":"why the attraction misleads"}]`,
    model,
  })

  // Fails closed. A partial or malformed score set silently reorders the
  // shortlist, and a caller cannot tell a bad ranking from a good one.
  const rows = parseScoreRows(raw)

  const known = new Set(ideas.map((idea) => idea.id))
  const scores = new Map<string, Score>()
  for (const row of rows) {
    if (!known.has(row.id)) continue
    scores.set(row.id, {
      novelty: row.novelty,
      viability: row.viability,
      fit: row.fit,
      total:
        row.novelty * SCORE_WEIGHTS.novelty +
        row.viability * SCORE_WEIGHTS.viability +
        row.fit * SCORE_WEIGHTS.fit,
      trap: row.trap,
      strength: row.strength,
    })
  }

  if (scores.size < ideas.length) {
    throw new Error(
      `scoring returned ${scores.size} valid scores for ${ideas.length} ideas; refusing a partial ranking`,
    )
  }

  return scores
}

async function clusterIdeas(
  dispatch: BranchDispatch,
  problem: string,
  ideas: Idea[],
  model: { providerID: string; modelID: string } | undefined,
): Promise<Cluster[]> {
  if (ideas.length === 0) return []
  try {
    const raw = await dispatch({
      title: "adhd: cluster",
      system: CLUSTER_SYSTEM,
      prompt: `PROBLEM:
${problem}

IDEAS:
${ideas.map((idea) => `${idea.id} :: ${idea.text}`).join("\n")}

Output JSON: [{"label":"...","ideaIds":["...","..."]}]`,
      model,
    })
    return parseClusterRows(raw)
  } catch {
    // Fails open — clusters describe the shape of the space; losing them costs
    // presentation, not correctness of the ranking.
    return []
  }
}

async function deepenIdea(
  dispatch: BranchDispatch,
  problem: string,
  idea: Idea,
  siblings: Idea[],
  model: { providerID: string; modelID: string } | undefined,
  onEvent: RunOptions["onEvent"],
): Promise<DeepenedIdea> {
  // Siblings are supplied deliberately. The isolation invariant governs
  // divergence; focus is where recombination is the point.
  const recombination = siblings
    .filter((sibling) => sibling.id !== idea.id)
    .slice(0, 12)
    .map((sibling) => `- ${sibling.text}`)
    .join("\n")

  try {
    const raw = await dispatch({
      title: "adhd: deepen",
      system: DEEPEN_SYSTEM,
      prompt: `PROBLEM:
${problem}

FOCUS IDEA:
${idea.text}
${idea.rationale ? `(${idea.rationale})` : ""}

SIBLING IDEAS (use for recombination if useful):
${recombination}

Output JSON:
{
  "sketch": "4-8 sentences. How it works. Load-bearing risk. First concrete step.",
  "childIdeas": [
    {"text": "...", "rationale": "variation / hybrid / unlock"}
  ]
}`,
      model,
    })

    const parsed = parseDeepenPayload(raw)
    return {
      ideaId: idea.id,
      sketch: parsed.sketch,
      childIdeas: parsed.childIdeas.map((child) => ({
        id: randomUUID(),
        frameId: idea.frameId,
        text: child.text,
        rationale: child.rationale,
        depth: idea.depth + 1,
        parentId: idea.id,
      })),
    }
  } catch (error) {
    // Fails open per idea, but never silently: a lost sketch used to be visible
    // only as odd text inside the result, which made an intermittent parse
    // failure almost impossible to attribute after the fact.
    const reason = error instanceof Error ? error.message : String(error)
    onEvent?.({ kind: "deepen:failed", ideaId: idea.id, reason })
    return {
      ideaId: idea.id,
      sketch: `(deepen pass failed: ${reason})`,
      childIdeas: [],
    }
  }
}

export async function run(dispatch: BranchDispatch, options: RunOptions): Promise<RunResult> {
  const {
    problem,
    context,
    framesPerRun = DEFAULTS.framesPerRun,
    ideasPerFrame = DEFAULTS.ideasPerFrame,
    topK = DEFAULTS.topK,
    concurrency = DEFAULTS.concurrency,
    codeMode = DEFAULTS.codeMode,
    stripAnchors = DEFAULTS.stripAnchors,
    model,
    criticModel,
    onEvent,
  } = options

  const critic = criticModel ?? model

  // PHASE 0 — REFRAME. An anchor buried in the problem statement infects every
  // branch no matter how well isolated they are, so it is stripped before fan-out.
  // Convergence still judges against the ORIGINAL problem: an idea has to fit the
  // real constraints to be viable.
  let divergeProblem = problem
  let reframe: string | undefined
  if (stripAnchors) {
    const result = await reframeProblem(dispatch, problem, context, model)
    if (result.changed && result.reframed.trim().length > 0) {
      divergeProblem = result.reframed
      reframe = result.reframed
    }
    onEvent?.({ kind: "reframe:done", changed: Boolean(reframe) })
  }

  const frames = selectFrames(framesPerRun, codeMode)
  const limit = createLimiter(concurrency)

  // PHASE 1 — DIVERGE. Parallel fan-out, no branch sees another.
  const branches = await Promise.all(
    frames.map((frame) =>
      limit(async () => {
        onEvent?.({ kind: "frame:start", frameId: frame.id, frameLabel: frame.label })
        const branch = await divergeBranch(
          dispatch,
          divergeProblem,
          context,
          frame,
          ideasPerFrame,
          model,
        )
        if (branch.failed) onEvent?.({ kind: "frame:failed", frameId: frame.id, reason: branch.failed })
        else onEvent?.({ kind: "frame:done", frameId: frame.id, count: branch.ideas.length })
        return branch
      }),
    ),
  )

  const allIdeas = branches.flatMap((branch) => branch.ideas)

  if (allIdeas.length === 0) {
    // Carry a branch's own reason up. Without it a dead provider and a model
    // that will not emit JSON produce the same message, and the caller cannot
    // tell which it is looking at.
    const reason = branches.find((branch) => branch.failed)?.failed
    throw new Error(
      `every divergent branch failed (${branches.length} frames); no candidates to score` +
        (reason ? `: ${reason}` : ""),
    )
  }

  // PHASE 2 — SCORE + CLUSTER. The critic comes back online.
  const [scores, clusters] = await Promise.all([
    scoreIdeas(dispatch, problem, allIdeas, critic),
    clusterIdeas(dispatch, problem, allIdeas, critic),
  ])
  for (const idea of allIdeas) idea.score = scores.get(idea.id)
  for (const cluster of clusters) {
    for (const id of cluster.ideaIds) {
      const idea = allIdeas.find((candidate) => candidate.id === id)
      if (idea) idea.cluster = cluster.label
    }
  }
  onEvent?.({ kind: "score:done", total: allIdeas.length })
  onEvent?.({ kind: "cluster:done", clusters: clusters.length })

  // Traps are excluded from the ranking and reported separately — an actionable
  // heads-up, not a deletion.
  const traps = allIdeas.filter((idea) => idea.score?.trap)
  const scored = allIdeas.filter((idea) => idea.score)
  const byTotal = (a: Idea, b: Idea) => b.score!.total - a.score!.total

  let ranked = scored.filter((idea) => !idea.score!.trap).sort(byTotal)

  // A critic that flags everything empties the ranking, and the run then returns
  // twelve scored ideas with no shortlist, no pick, and nothing deepened — all
  // the cost of a run and none of its output. Observed live, so it is handled
  // rather than assumed away: rank the trapped set instead and say so, since a
  // shortlist whose every entry carries a named cost still beats no shortlist.
  let trapFallback = false
  if (ranked.length === 0 && scored.length > 0) {
    trapFallback = true
    ranked = [...scored].sort(byTotal)
    onEvent?.({ kind: "trap:fallback", trapped: traps.length })
  }

  const shortlist = ranked.slice(0, Math.max(2, Math.min(4, topK + 1)))

  const nonObviousPick =
    shortlist.length === 0
      ? null
      : [...shortlist].sort(
          (a, b) =>
            b.score!.novelty + b.score!.viability * 0.5 - (a.score!.novelty + a.score!.viability * 0.5),
        )[0]!

  // PHASE 3 — FOCUS. Connect the dots on the survivors.
  const deepened = await Promise.all(
    ranked.slice(0, topK).map((idea) =>
      limit(async () => {
        onEvent?.({ kind: "deepen:start", ideaId: idea.id, text: idea.text })
        const result = await deepenIdea(dispatch, problem, idea, allIdeas, model, onEvent)
        onEvent?.({ kind: "deepen:done", ideaId: idea.id })
        return result
      }),
    ),
  )

  // The provocation is the highest-novelty leaf reframed as a question. Cheap —
  // it does not need another dispatch.
  const wildcard = [...allIdeas]
    .filter((idea) => idea.score)
    .sort((a, b) => b.score!.novelty - a.score!.novelty)[0]

  return {
    problem,
    reframe,
    branches,
    clusters,
    shortlist,
    nonObviousPick,
    traps,
    deepened,
    provocation: wildcard
      ? `What if we took this seriously: ${wildcard.text}`
      : "What's the assumption nobody named yet?",
    ...(trapFallback ? { trapFallback: true } : {}),
  }
}
