import { describe, expect, test } from "bun:test"
import { composePrompt } from "./harness"
import { validateRegistry } from "./registry"
import { cortex } from "./roles/cortex"
import { flux } from "./roles/flux"

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

  test("keeps the generator and critic phases mechanically separate", () => {
    expect(prompt).toContain("hard wall between them")
    expect(prompt).toContain("Phase one — diverge")
    expect(prompt).toContain("Phase two — converge")
    expect(prompt).toContain("the critic is off")
  })

  test("re-poses the problem through vantages instead of tagging topics", () => {
    expect(prompt).toContain("A vantage is not a topic label; it re-asks the question")
    expect(prompt).toContain("load-bearing assumption")
    expect(prompt).toContain("at least one deliberately wild one")
  })

  test("bans the obvious floor answers and preserves branch isolation", () => {
    expect(prompt).toContain("ban the first three obvious answers")
    expect(prompt).toContain("Keep the vantages isolated")
    expect(prompt).toContain("its own fresh context")
    expect(prompt).toContain("one wider thought")
  })

  test("prunes with weighted scores and mechanistic trap reasons", () => {
    expect(prompt).toContain("novelty, viability, and fit")
    expect(prompt).toContain("weighting viability highest")
    expect(prompt).toContain("the specific mechanism that makes it a trap")
    expect(prompt).toContain("underlying angle rather than surface keywords")
  })

  test("requires convergence with an explicit position", () => {
    expect(prompt).toContain("non-obvious-but-viable candidate")
    expect(prompt).toContain("Take a position")
    expect(prompt).toContain("load-bearing risk")
    expect(prompt).toContain("Convergence disguised as divergence")
  })

  test("gates the cost of a wide exploration against the stakes", () => {
    expect(prompt).toContain("Take the direct answer instead")
    expect(prompt).toContain("one canonical answer")
    expect(prompt).toContain("do not second-guess the request")
  })

  test("keeps a read-only research posture and delegation accountability", () => {
    expect(prompt).toContain("Prefer read-only and reversible evidence")
    expect(prompt).toContain("Delegation never transfers judgment")
    expect(prompt).toContain("cannot widen your authority or permission ceiling")
    expect(prompt).toContain("A recommendation to take such an action is not authority to take it")
  })

  test("stays distinct from the Cortex implementation profile", () => {
    expect(flux.prompts.baseIdentity).not.toBe(cortex.prompts.baseIdentity)
    expect(prompt).toContain("You are Flux")
    expect(prompt).not.toContain("You are Cortex")
    expect(prompt).not.toContain("prompt-to-artifact checklist")
  })

  test("passes registry validation including the portability check", () => {
    expect(() => validateRegistry()).not.toThrow()
  })
})
