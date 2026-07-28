import { describe, expect, test } from "bun:test"
import { composePrompt, createAgentConfigs } from "./harness"
import { archetypeRegistry, validateRegistry } from "./registry"
import { cortex } from "./roles/cortex"
import { flux } from "./roles/flux"
import { zen } from "./roles/zen"

describe("Flux prompt profile", () => {
  const prompt = composePrompt(flux)

  test("owns a complete prompt profile without changing the six-section contract", () => {
    expect(flux.prompts.baseIdentity).toBeDefined()
    expect(flux.prompts.sharedSecurity).toBeDefined()
    expect(flux.prompts.baseTask).toBeDefined()
    expect(prompt.match(/^# (?:Base Identity|Role Identity|Shared Security|Role Security Additions|Base Task Behavior|Role Task Behavior)$/gm)).toEqual([
      "# Base Identity",
      "# Role Identity",
      "# Shared Security",
      "# Role Security Additions",
      "# Base Task Behavior",
      "# Role Task Behavior",
    ])
  })

  test("states the posture as perception before any method is described", () => {
    const identity = flux.prompts.baseIdentity ?? ""
    expect(identity).toContain("You do not have a brainstorming mode; you have a way of reading problems")
    // The posture must land before the reader reaches the first procedural section.
    expect(identity.indexOf("way of reading problems")).toBeLessThan(identity.indexOf("## Authority"))
  })

  test("never offers an exit from the posture, only from the ceremony", () => {
    expect(prompt).toContain("Calibrate the amplitude, not the posture")
    expect(prompt).toContain("The only thing that ever switches off is the ceremony")
    expect(prompt).toContain("never offer the wide version as an upsell")
    // The skill's abort gate must not survive the port into an always-on archetype.
    expect(prompt).not.toContain("Take the direct answer instead")
    expect(prompt).not.toContain("do not second-guess the request")
  })

  test("scales amplitude instead of switching the method on and off", () => {
    expect(prompt).toContain("Most turns run at low amplitude")
    expect(prompt).toContain("three vantages and four candidates for something small like a name")
    expect(prompt).toContain("five distinct vantages by default and generate six candidates under each")
  })

  test("treats branch isolation as an invariant with a labelled degraded path", () => {
    expect(prompt).toContain("Isolation is an invariant, not a preference")
    expect(prompt).toContain("say plainly that it is the degraded form")
    expect(prompt).toContain("Do not spawn a second generation of vantage branches")
    // The generator/critic split must be carried by the delegate's own instructions.
    expect(prompt).toContain("not promised inside one session")
  })

  test("carries the frame library with vocabulary hooks and wild tags", () => {
    const frames = ["Hardware engineer", "Regulator", "10-year-old", "Hostile competitor", "Biology",
      "Logistics", "Game design", "Markets", "Inversion", "Zero budget, one hour",
      "Infinite budget, ten years", "Remove the load-bearing assumption", "Speedrunner", "Ant colony", "3am on-call"]
    for (const frame of frames) expect(prompt).toContain(`**${frame}**`)
    // The distinct vocabulary is the mechanism; a bare frame name does not transplant.
    expect(prompt).toContain("pheromone trails")
    expect(prompt).toContain("clearing houses")
    expect(prompt).toContain("immune systems")
    expect(prompt.match(/\(wild\)/g)).toHaveLength(8)
    expect(prompt).toContain("four tagged engineering or design plus exactly one wild")
  })

  test("preserves the source's load-bearing counts", () => {
    expect(prompt).toContain("about thirty in the pool")
    expect(prompt).toContain("zero to ten")
    expect(prompt).toContain("three to six groups")
    expect(prompt).toContain("Deepen the top three survivors")
    expect(prompt).toContain("four to eight sentences")
    expect(prompt).toContain("three to five child ideas")
    expect(prompt).toContain("two to four candidates on the shortlist")
  })

  test("states the true cost of a full exploration", () => {
    expect(prompt).toContain("five to ten times the cost of a direct answer")
    expect(prompt).toContain("re-loads the full base context")
  })

  test("strips anchors before fanning out and judges against the original", () => {
    expect(prompt).toContain("strip incidental anchors")
    expect(prompt).toContain("judge against the original")
    expect(prompt).toContain("Keep anchors that are genuine constraints")
  })

  test("keeps the critic's two signals and the seeding rationale", () => {
    expect(prompt).toContain("Name a strength for every candidate")
    expect(prompt).toContain("two signals rather than a verdict")
    expect(prompt).toContain("they earn their place by seeding viable ones")
    expect(prompt).toContain("the specific mechanism that makes them traps")
  })

  test("carries divergence into delivered work rather than stopping at a brief", () => {
    expect(prompt).toContain("Divergence that stops at a brief is half the job")
    expect(prompt).toContain("does not excuse the execution")
    expect(prompt).toContain("Take a position")
    // Output shape must scale to what was found, not to the method used.
    expect(prompt).toContain("Never render the full shape over a thin result")
  })

  test("covers interface work and protects known affordances from the novelty ban", () => {
    expect(prompt).toContain("Conventional interaction patterns are load-bearing, not floor answers")
    expect(prompt).toContain("state coverage across loading, empty, error, disabled, and overflow")
    expect(prompt).toContain("inaccessible contrast")
    expect(prompt).toContain("a rendered surface is a stronger deliverable than a described one")
  })

  test("holds full engineering authority rather than a read-only research band", () => {
    expect(prompt).toContain("build, fix, refactor, design, prototype, migrate, and review requests")
    expect(prompt).toContain("you carry work to a finished, verified result yourself")
    expect(prompt).not.toContain("Do not implement production changes")
    expect(prompt).not.toContain("Prefer read-only and reversible evidence")
    // Prototype freedom must not become a licence against production paths.
    expect(prompt).toContain("A prototype belongs on a disposable surface")
  })

  test("matches Cortex's capability ceiling while differing in posture", () => {
    expect(flux.nativeToolCatalog).toEqual(cortex.nativeToolCatalog)
    expect([...flux.plugins].sort()).toEqual([...cortex.plugins].sort())
    expect(flux.permissions).toEqual(cortex.permissions)
    expect(flux.model.steps).toBe(cortex.model.steps)
    expect(flux.model.temperature).toBeGreaterThan(cortex.model.temperature ?? 0)
  })

  test("stays distinct from the Cortex and Zen profiles", () => {
    expect(flux.prompts.baseIdentity).not.toBe(cortex.prompts.baseIdentity)
    expect(prompt).toContain("You are Flux")
    expect(prompt).not.toContain("You are Cortex")
    expect(prompt).not.toContain("prompt-to-artifact checklist")

    // Regression guard: Flux and Zen were authored together and duplicated whole
    // paragraphs of role posture. Text shared with Cortex as well is a harness
    // invariant and legitimate; text shared only with Zen is posture duplication.
    const sentences = (text: string) => new Set(
      text.split(/(?<=[.!?])\s+/).map((s) => s.replace(/\s+/g, " ").trim()).filter((s) => s.length > 60),
    )
    const postureDupes = (field: "baseTask" | "task") => {
      const zenText = sentences(zen.prompts[field] ?? "")
      const cortexText = sentences(cortex.prompts[field] ?? "")
      return [...sentences(flux.prompts[field] ?? "")].filter((s) => zenText.has(s) && !cortexText.has(s))
    }
    expect(postureDupes("baseTask")).toEqual([])
    expect(postureDupes("task")).toEqual([])
  })

  test("passes registry validation and emits a loadable agent config", () => {
    expect(() => validateRegistry()).not.toThrow()
    const configs = createAgentConfigs(archetypeRegistry)
    expect(configs.flux?.mode).toBe("all")
    expect(configs.flux?.prompt).toBe(prompt)
  })
})
