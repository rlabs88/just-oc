import { describe, expect, test } from "bun:test"
import { buildDivergeBrief, run, type DispatchInput } from "./engine"
import { FRAMES, selectFrames } from "./frames"
import { createLimiter } from "./limit"
import { parseScoreRows, extractJSON } from "./parse"
import {
  CLUSTER_SYSTEM,
  DEEPEN_SYSTEM,
  DIVERGE_SYSTEM,
  REFRAME_SYSTEM,
  SCORE_SYSTEM,
} from "./prompts"

type Recorded = DispatchInput

/**
 * Fake dispatch. Responds by phase, recording every brief so the isolation and
 * phase-separation invariants can be asserted against what a branch actually
 * received rather than against what the engine intended to send.
 */
function fakeDispatch(overrides: Partial<Record<string, string>> = {}) {
  const calls: Recorded[] = []

  const dispatch = async (input: DispatchInput): Promise<string> => {
    calls.push(input)

    if (input.system === REFRAME_SYSTEM) {
      return overrides.reframe ?? JSON.stringify({ reframed: "stripped problem", changed: true })
    }
    if (input.system === DIVERGE_SYSTEM) {
      if (overrides.diverge) return overrides.diverge
      const frame = input.title.replace("adhd: diverge — ", "")
      return JSON.stringify([
        { text: `${frame} idea one`, rationale: "r1" },
        { text: `${frame} idea two` },
      ])
    }
    if (input.system === SCORE_SYSTEM) {
      if (overrides.score) return overrides.score
      const ids = [...input.prompt.matchAll(/^([0-9a-f-]{36}) :: /gm)].map((match) => match[1]!)
      return JSON.stringify(
        ids.map((id, index) => ({
          id,
          novelty: 10 - index,
          viability: 5 + (index % 3),
          fit: 7,
          strength: "concrete thing",
          ...(index === 1 ? { trap: "breaks past 10k users" } : {}),
        })),
      )
    }
    if (input.system === CLUSTER_SYSTEM) {
      if (overrides.cluster) return overrides.cluster
      const ids = [...input.prompt.matchAll(/^([0-9a-f-]{36}) :: /gm)].map((match) => match[1]!)
      return JSON.stringify([{ label: "cache-shaped plays", ideaIds: ids.slice(0, 2) }])
    }
    if (input.system === DEEPEN_SYSTEM) {
      return (
        overrides.deepen ??
        JSON.stringify({
          sketch: "How it works. The risk. The first step.",
          childIdeas: [{ text: "child idea", rationale: "unlock" }],
        })
      )
    }
    throw new Error(`unexpected system prompt: ${input.system.slice(0, 40)}`)
  }

  return { dispatch, calls }
}

const baseOptions = {
  problem: "keep the dashboard responsive under load",
  framesPerRun: 3,
  ideasPerFrame: 2,
  topK: 2,
}

describe("branch isolation", () => {
  test("a divergence brief carries the problem and one frame, and no sibling output", async () => {
    const { dispatch, calls } = fakeDispatch()
    await run(dispatch, { ...baseOptions, context: "React 19, Postgres" })

    const diverge = calls.filter((call) => call.system === DIVERGE_SYSTEM)
    expect(diverge.length).toBe(3)

    for (const call of diverge) {
      // Every sibling's generated text must be absent from this brief.
      const siblingFrames = diverge.filter((other) => other !== call)
      for (const sibling of siblingFrames) {
        const siblingLabel = sibling.title.replace("adhd: diverge — ", "")
        expect(call.prompt).not.toContain(`${siblingLabel} idea one`)
        expect(call.prompt).not.toContain(`${siblingLabel} idea two`)
      }
      expect(call.prompt).toContain("stripped problem")
      expect(call.prompt).toContain("React 19, Postgres")
    }
  })

  test("buildDivergeBrief contains only problem, context, and the frame", () => {
    const frame = FRAMES[0]!
    const brief = buildDivergeBrief("P", "C", frame, 4)

    expect(brief).toContain("P")
    expect(brief).toContain("C")
    expect(brief).toContain(frame.label)
    expect(brief).toContain(frame.prompt)
    expect(brief).toContain("Generate 4 ideas")
    expect(brief).not.toContain("SIBLING")
  })

  test("divergence dispatches all start before any of them is scored", async () => {
    const order: string[] = []
    const { dispatch } = fakeDispatch()

    const traced = async (input: DispatchInput) => {
      if (input.system === DIVERGE_SYSTEM) order.push("diverge:start")
      if (input.system === SCORE_SYSTEM) order.push("score:start")
      const result = await dispatch(input)
      if (input.system === DIVERGE_SYSTEM) order.push("diverge:end")
      return result
    }

    await run(traced, { ...baseOptions, concurrency: 3 })

    // The phase wall: no scoring may begin until every branch has returned.
    const lastDivergeEnd = order.lastIndexOf("diverge:end")
    const firstScore = order.indexOf("score:start")
    expect(firstScore).toBeGreaterThan(lastDivergeEnd)
  })
})

describe("generator / critic split", () => {
  test("convergence phases retain caller context", async () => {
    const { dispatch, calls } = fakeDispatch()
    await run(dispatch, { ...baseOptions, context: "React 19, Postgres, no Redis" })

    const convergence = calls.filter((call) =>
      [SCORE_SYSTEM, CLUSTER_SYSTEM, DEEPEN_SYSTEM].includes(call.system),
    )
    expect(convergence.length).toBeGreaterThan(0)
    for (const call of convergence) {
      expect(call.prompt).toContain("CONTEXT:\nReact 19, Postgres, no Redis")
    }
  })

  test("generation and evaluation run as separate dispatches under separate systems", async () => {
    const { dispatch, calls } = fakeDispatch()
    await run(dispatch, baseOptions)

    const systems = new Set(calls.map((call) => call.system))
    expect(systems.has(DIVERGE_SYSTEM)).toBe(true)
    expect(systems.has(SCORE_SYSTEM)).toBe(true)

    // No single dispatch is asked to both generate and evaluate.
    for (const call of calls) {
      const isGenerator = call.system === DIVERGE_SYSTEM
      const isCritic = call.system === SCORE_SYSTEM
      expect(isGenerator && isCritic).toBe(false)
    }
  })

  test("the critic model is used for scoring and clustering only", async () => {
    const { dispatch, calls } = fakeDispatch()
    await run(dispatch, {
      ...baseOptions,
      model: { providerID: "gen", modelID: "g1" },
      criticModel: { providerID: "crit", modelID: "c1" },
    })

    for (const call of calls) {
      const expected =
        call.system === SCORE_SYSTEM || call.system === CLUSTER_SYSTEM ? "crit" : "gen"
      expect(call.model?.providerID).toBe(expected)
    }
  })
})

describe("structured output", () => {
  test("returns the full RunResult shape", async () => {
    const { dispatch } = fakeDispatch()
    const result = await run(dispatch, baseOptions)

    expect(result.problem).toBe(baseOptions.problem)
    expect(result.reframe).toBe("stripped problem")
    expect(result.branches.length).toBe(3)
    expect(result.clusters.length).toBe(1)
    expect(result.shortlist.length).toBeGreaterThan(0)
    expect(result.nonObviousPick).not.toBeNull()
    expect(result.deepened.length).toBe(2)
    expect(result.provocation).toStartWith("What if we took this seriously:")
  })

  test("traps are excluded from the ranking and reported separately", async () => {
    const { dispatch } = fakeDispatch()
    const result = await run(dispatch, baseOptions)

    expect(result.traps.length).toBeGreaterThan(0)
    for (const trapped of result.traps) {
      expect(result.shortlist.find((idea) => idea.id === trapped.id)).toBeUndefined()
      expect(result.deepened.find((idea) => idea.ideaId === trapped.id)).toBeUndefined()
    }
  })

  test("an all-trapped run still produces a shortlist, flagged", async () => {
    // Observed on a live run: the critic trapped all 12 candidates, which emptied
    // the ranking and returned no shortlist, no pick, and nothing deepened.
    const { dispatch } = fakeDispatch()
    const allTrapped = async (input: DispatchInput) => {
      const raw = await dispatch(input)
      if (input.system !== SCORE_SYSTEM) return raw
      const rows = extractJSON(raw) as Array<Record<string, unknown>>
      for (const row of rows) row.trap = "looks good, is not"
      return JSON.stringify(rows)
    }

    const result = await run(allTrapped, baseOptions)

    expect(result.trapFallback).toBe(true)
    expect(result.shortlist.length).toBeGreaterThan(0)
    expect(result.nonObviousPick).not.toBeNull()
    expect(result.deepened.length).toBe(2)
    // The traps are still reported — the fallback ranks them, it does not hide them.
    expect(result.traps.length).toBe(result.branches.flatMap((b) => b.ideas).length)
    expect(result.shortlist.every((idea) => idea.score?.trap)).toBe(true)
  })

  test("the fallback is announced, never silent", async () => {
    const { dispatch } = fakeDispatch()
    const events: string[] = []
    const allTrapped = async (input: DispatchInput) => {
      const raw = await dispatch(input)
      if (input.system !== SCORE_SYSTEM) return raw
      const rows = extractJSON(raw) as Array<Record<string, unknown>>
      for (const row of rows) row.trap = "t"
      return JSON.stringify(rows)
    }

    await run(allTrapped, { ...baseOptions, onEvent: (e) => events.push(e.kind) })
    expect(events).toContain("trap:fallback")
  })

  test("a normal run does not set the fallback flag", async () => {
    const { dispatch } = fakeDispatch()
    const result = await run(dispatch, baseOptions)
    expect(result.trapFallback).toBeUndefined()
    expect(result.shortlist.every((idea) => !idea.score?.trap)).toBe(true)
  })

  test("clusters stamp their label onto member ideas", async () => {
    const { dispatch } = fakeDispatch()
    const result = await run(dispatch, baseOptions)

    const clustered = result.branches
      .flatMap((branch) => branch.ideas)
      .filter((idea) => idea.cluster)
    expect(clustered.length).toBe(2)
    expect(clustered[0]!.cluster).toBe("cache-shaped plays")
  })
})

describe("failure paths", () => {
  test("scoring fails closed on malformed output", async () => {
    const { dispatch } = fakeDispatch({ score: "not json at all" })
    await expect(run(dispatch, baseOptions)).rejects.toThrow()
  })

  test("scoring fails closed on a partial score set", async () => {
    const { dispatch } = fakeDispatch()
    const partial = async (input: DispatchInput) => {
      const raw = await dispatch(input)
      if (input.system !== SCORE_SYSTEM) return raw
      return JSON.stringify(parseScoreRows(raw).slice(0, 1))
    }
    await expect(run(partial, baseOptions)).rejects.toThrow(/partial ranking/)
  })

  test("scoring fails closed on an out-of-range axis", async () => {
    const { dispatch } = fakeDispatch()
    const outOfRange = async (input: DispatchInput) => {
      const raw = await dispatch(input)
      if (input.system !== SCORE_SYSTEM) return raw
      const rows = extractJSON(raw) as Array<Record<string, unknown>>
      rows[0]!.novelty = 42
      return JSON.stringify(rows)
    }
    await expect(run(outOfRange, baseOptions)).rejects.toThrow(/novelty/)
  })

  test("the reframe pass fails open onto the original problem", async () => {
    const { dispatch, calls } = fakeDispatch({ reframe: "}{ broken" })
    const result = await run(dispatch, baseOptions)

    expect(result.reframe).toBeUndefined()
    const diverge = calls.filter((call) => call.system === DIVERGE_SYSTEM)
    expect(diverge[0]!.prompt).toContain(baseOptions.problem)
  })

  test("clustering fails open", async () => {
    const { dispatch } = fakeDispatch({ cluster: "not json" })
    const result = await run(dispatch, baseOptions)
    expect(result.clusters).toEqual([])
    expect(result.shortlist.length).toBeGreaterThan(0)
  })

  test("one dead branch narrows the run without ending it", async () => {
    const { dispatch } = fakeDispatch()
    let first = true
    const oneDead = async (input: DispatchInput) => {
      if (input.system === DIVERGE_SYSTEM && first) {
        first = false
        throw new Error("provider hiccup")
      }
      return dispatch(input)
    }

    const result = await run(oneDead, baseOptions)
    const failed = result.branches.filter((branch) => branch.failed)
    expect(failed.length).toBe(1)
    expect(failed[0]!.failed).toContain("provider hiccup")
    expect(result.shortlist.length).toBeGreaterThan(0)
  })

  test("a run with no surviving branch fails rather than returning an empty result", async () => {
    const { dispatch } = fakeDispatch({ diverge: "not json" })
    await expect(run(dispatch, baseOptions)).rejects.toThrow(/no candidates to score/)
  })

  test("a deepen failure degrades that idea only", async () => {
    const { dispatch } = fakeDispatch({ deepen: "not json" })
    const result = await run(dispatch, baseOptions)

    expect(result.deepened.length).toBe(2)
    for (const deepened of result.deepened) {
      expect(deepened.sketch).toContain("deepen pass failed")
      expect(deepened.childIdeas).toEqual([])
    }
  })

  test("a deepen failure is announced, not buried in the sketch text", async () => {
    // Regression guard: a lost sketch was previously visible only as odd prose
    // inside the result, which made an intermittent live failure unattributable.
    const { dispatch } = fakeDispatch({ deepen: "not json" })
    const events: Array<{ kind: string }> = []
    await run(dispatch, { ...baseOptions, onEvent: (e) => events.push(e) })

    expect(events.filter((e) => e.kind === "deepen:failed").length).toBe(2)
  })
})

describe("frame selection", () => {
  test("always includes a wild frame", () => {
    for (let seed = 0; seed < 20; seed++) {
      let calls = 0
      const random = () => ((seed + calls++) % 10) / 10
      const frames = selectFrames(5, true, random)
      expect(frames.some((frame) => frame.tags.includes("wild"))).toBe(true)
    }
  })

  test("a one-frame run selects a wild vantage", () => {
    for (let seed = 0; seed < 20; seed++) {
      let calls = 0
      const random = () => ((seed + calls++) % 10) / 10
      const frames = selectFrames(1, true, random)

      expect(frames).toHaveLength(1)
      expect(frames[0]?.tags).toContain("wild")
    }
  })

  test("code mode draws only from engineering vantages plus the wild pick", () => {
    const frames = selectFrames(4, true, () => 0)
    for (const frame of frames) {
      const engineering = frame.tags.includes("code") || frame.tags.includes("design")
      expect(engineering || frame.tags.includes("wild")).toBe(true)
    }
  })

  test("returns distinct frames", () => {
    const frames = selectFrames(6, false, Math.random)
    expect(new Set(frames.map((frame) => frame.id)).size).toBe(frames.length)
  })

  test("returns exactly the requested count, even when the wild pick was already drawn", () => {
    // Regression guard: forcing a wild frame in used to drop the count by one
    // whenever that frame had already been selected, so a run quietly diverged
    // over fewer vantages than the caller asked for.
    for (let seed = 0; seed < 50; seed++) {
      let calls = 0
      const random = () => ((seed * 7 + calls++ * 3) % 100) / 100
      for (const count of [1, 3, 5, 8]) {
        expect(selectFrames(count, true, random).length).toBe(count)
        expect(selectFrames(count, false, random).length).toBe(count)
      }
    }
  })

  test("caps at the size of the vantage library", () => {
    expect(selectFrames(999, false, Math.random).length).toBe(FRAMES.length)
  })
})

describe("concurrency", () => {
  test("never exceeds the configured ceiling", async () => {
    const limit = createLimiter(2)
    let active = 0
    let peak = 0

    await Promise.all(
      Array.from({ length: 8 }, () =>
        limit(async () => {
          active++
          peak = Math.max(peak, active)
          await new Promise((resolve) => setTimeout(resolve, 5))
          active--
        }),
      ),
    )

    expect(peak).toBe(2)
  })
})
