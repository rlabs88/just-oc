/**
 * Cognitive frames — the vantage library.
 *
 * A frame is a strategy for re-asking one problem from somewhere the generator
 * would not naturally stand. The set, its ordering, and the `wild` classification
 * are ported from the ADHD method (UditAkhourii/adhd, MIT).
 *
 * The `wild` tag is load-bearing, not decoration: selection always forces one in,
 * because a run drawn purely from engineering vantages converges on the same
 * neighbourhood it started in.
 */

export type FrameTag = "code" | "design" | "general" | "wild"

export type Frame = {
  id: string
  label: string
  /** Injected into the branch brief. Written as an instruction to stand somewhere. */
  prompt: string
  tags: FrameTag[]
}

export const FRAMES: readonly Frame[] = [
  {
    id: "hardware-eyes",
    label: "Hardware engineer",
    prompt:
      "You think in latency, memory layout, and physical constraints. Re-ask this problem as if it were a hardware or firmware problem. What do the bus topology, the cache, and the timing budget tell you?",
    tags: ["code", "wild"],
  },
  {
    id: "regulator",
    label: "Regulator / auditor",
    prompt:
      "You audit systems for compliance and failure modes. What surfaces when you ask what must be provable, traceable, or refusable here?",
    tags: ["design", "general"],
  },
  {
    id: "ten-year-old",
    label: "10-year-old",
    prompt:
      "You are a curious 10-year-old who has never seen software. Describe naive but unencumbered approaches. Ignore convention entirely.",
    tags: ["general", "wild"],
  },
  {
    id: "adversary",
    label: "Competitor trying to break it",
    prompt:
      "You are a hostile competitor or attacker. Generate approaches that exploit, break, or sabotage the obvious solution, then invert each one into an idea.",
    tags: ["code", "design"],
  },
  {
    id: "biology",
    label: "Cross-domain: biology",
    prompt:
      "Transplant a mechanism from biology — immune response, neural plasticity, cell signalling, evolution, gut flora — and force-fit it onto this engineering problem.",
    tags: ["code", "wild"],
  },
  {
    id: "logistics",
    label: "Cross-domain: logistics",
    prompt:
      "Steal mechanisms from logistics: queues, batching, just-in-time, hub-and-spoke, returns, last-mile. Apply them literally to this problem.",
    tags: ["code", "design"],
  },
  {
    id: "game-design",
    label: "Cross-domain: game design",
    prompt:
      "Approach this as a game designer. What are the loops, the rewards, the friction, the save states, the speedrun tricks? Treat the user or system as a player.",
    tags: ["design", "general"],
  },
  {
    id: "markets",
    label: "Cross-domain: markets",
    prompt:
      "Treat the problem as a market. Who are the buyers, the sellers, the market-makers? What would an auction, a futures contract, or a clearing house look like here?",
    tags: ["design", "wild"],
  },
  {
    id: "inversion",
    label: "Inversion",
    prompt:
      "Ask the opposite question. If the goal is X, generate ways to guarantee not-X, then negate each answer back into an idea.",
    tags: ["code", "design", "general"],
  },
  {
    id: "extreme-zero",
    label: "Extreme: $0 budget, one hour",
    prompt:
      "You have no money, no team, and one hour. What is the crudest version that still does the load-bearing thing? Hacks, hardcoded values, and manual loops are welcome.",
    tags: ["code", "general"],
  },
  {
    id: "extreme-infinite",
    label: "Extreme: infinite budget, ten years",
    prompt:
      "You have infinite compute, infinite engineers, and a decade. What does the maximalist version look like? What is only possible at that scale?",
    tags: ["design", "wild"],
  },
  {
    id: "remove-assumption",
    label: "Remove the load-bearing assumption",
    prompt:
      "Name the thing everyone treats as fixed here — the framework, the database, the request/response model, the file system, the network. Imagine it is gone. Generate ideas that only exist in that world.",
    tags: ["code", "design", "wild"],
  },
  {
    id: "speedrunner",
    label: "Speedrunner",
    prompt:
      "You are a speedrunner. Find the glitches, skips, out-of-bounds tricks, and frame-perfect shortcuts. What is the abusive-but-legal path through this problem?",
    tags: ["code", "wild"],
  },
  {
    id: "ant-colony",
    label: "Ant colony / swarm",
    prompt:
      "There is no central planner. Many simple agents, local rules, pheromone trails. How does this problem solve itself emergently?",
    tags: ["code", "wild"],
  },
  {
    id: "ops-3am",
    label: "On-call at 3am",
    prompt:
      "You are the on-call engineer woken at 3am when this breaks. What design would stop the page happening? What is the runbook-shaped solution?",
    tags: ["code", "design"],
  },
]

/** Fisher-Yates — uniform, unlike sorting on a random comparator. */
function shuffle<T>(input: readonly T[], random: () => number): T[] {
  const items = [...input]
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[items[i], items[j]] = [items[j]!, items[i]!]
  }
  return items
}

/**
 * Pick `n` frames for a run.
 *
 * Biases toward engineering vantages when the problem is code-shaped, then forces
 * one wild frame in so the run keeps range. `random` is injectable so a test can
 * pin the selection.
 */
export function selectFrames(n: number, codeMode = true, random: () => number = Math.random): Frame[] {
  const target = Math.max(1, Math.min(Math.floor(n), FRAMES.length))
  const pool = codeMode
    ? FRAMES.filter((frame) => frame.tags.includes("code") || frame.tags.includes("design"))
    : [...FRAMES]
  const wild = FRAMES.filter((frame) => frame.tags.includes("wild"))

  const picked = shuffle(pool, random).slice(0, Math.max(1, target - 1))
  const wildPick = wild[Math.floor(random() * wild.length)]!
  if (!picked.some((frame) => frame.id === wildPick.id)) picked.push(wildPick)

  // Top up when the forced wild pick was already drawn. Without this the run
  // silently comes back one vantage short of what the caller asked for, and a
  // narrower run is indistinguishable from the requested one. Draw from the
  // biased pool first so code mode still means code mode.
  if (picked.length < target) {
    const chosen = new Set(picked.map((frame) => frame.id))
    for (const frame of [...shuffle(pool, random), ...shuffle(FRAMES, random)]) {
      if (picked.length >= target) break
      if (chosen.has(frame.id)) continue
      picked.push(frame)
      chosen.add(frame.id)
    }
  }

  return picked.slice(0, target)
}
