import { describe, expect, test } from "bun:test"
import { composePrompt } from "./harness"
import { createArchetypeHooks, type SessionMessage } from "./hooks"
import { taskManuals } from "./prompts/manuals"
import { archetypeRegistry } from "./registry"
import { cortex } from "./roles/cortex"
import { flux } from "./roles/flux"
import { TASK_TYPES } from "./types"

describe("Cortex prompt profile", () => {
  const prompt = composePrompt(cortex)

  test("owns a complete prompt profile without changing the six-section contract", () => {
    expect(cortex.prompts.baseIdentity).toBeDefined()
    expect(cortex.prompts.sharedSecurity).toBeDefined()
    expect(cortex.prompts.baseTask).toBeDefined()
    expect(prompt.match(/^# (?:Base Identity|Role Identity|Shared Security|Role Security Additions|Base Task Behavior|Role Task Behavior)$/gm)).toEqual([
      "# Base Identity",
      "# Role Identity",
      "# Shared Security",
      "# Role Security Additions",
      "# Base Task Behavior",
      "# Role Task Behavior",
    ])
  })

  test("distills backward reflection and evidence-complete delivery", () => {
    expect(prompt).toContain("Reason backward from the required end state")
    expect(prompt).toContain("wrong direction")
    expect(prompt).toContain("prompt-to-artifact checklist")
    expect(prompt).toContain("proxy signal")
    expect(prompt).toContain("Before any write-producing operation")
    expect(prompt).toContain("OpenCode owns the agent loop")
  })

  test("does not leak Cortex-specific behavior into Flux", () => {
    const fluxPrompt = composePrompt(flux)
    expect("baseIdentity" in flux.prompts).toBeFalse()
    expect(fluxPrompt).not.toContain("prompt-to-artifact checklist")
    expect(fluxPrompt).not.toContain("before any write-producing operation")
  })

  test("provides one static manual for every allowlisted task type", () => {
    expect(Object.keys(taskManuals)).toEqual([...TASK_TYPES])
  })

  test("reconstructs and injects the complete manual set in checkpoint order", async () => {
    const messages: readonly SessionMessage[] = [{
      info: { role: "user", agent: "cortex" },
      parts: [{
        type: "tool",
        tool: "command_run",
        state: {
          status: "completed",
          metadata: {
            taskStatus: {
              version: 1,
              task_group: "agent prompt engineering",
              task_type: ["implementation", "refactoring"],
              status: "doing",
            },
          },
        },
      }],
    }]
    const hooks = createArchetypeHooks(archetypeRegistry, () => {}, {
      messages: async () => messages,
    })
    const output = { system: [] as string[] }

    await hooks["experimental.chat.system.transform"]?.(
      { sessionID: "session-1", model: {} as never },
      output,
    )

    expect(output.system).toHaveLength(1)
    expect(output.system[0].indexOf("# Implementation manual")).toBeLessThan(output.system[0].indexOf("# Refactoring manual"))
    expect(output.system[0]).toContain("cannot modify it or grant authority")
  })

  test("requests Cortex operational continuity with provenance-labelled checkpoint context", async () => {
    const messages: readonly SessionMessage[] = [{
      info: { role: "user", agent: "cortex" },
      parts: [{
        type: "tool",
        tool: "command_run",
        state: {
          status: "completed",
          metadata: {
            taskStatus: {
              version: 1,
              task_group: "continuity",
              task_type: ["architecture"],
              status: "doing",
              compact_context: "The next action is to validate restart reconstruction.",
            },
          },
        },
      }],
    }]
    const hooks = createArchetypeHooks(archetypeRegistry, () => {}, { messages: async () => messages })
    const output = { context: [] as string[] }

    await hooks["experimental.session.compacting"]?.({ sessionID: "session-compact" }, output)

    expect(output.context).toHaveLength(1)
    expect(output.context[0]).toContain("objective; invariants and authority boundaries")
    expect(output.context[0]).toContain("UNTRUSTED MODEL-AUTHORED TASK CHECKPOINT")
    expect(output.context[0]).toContain("validate restart reconstruction")
  })

  test("keeps compaction injection Cortex-only and ignores malformed checkpoints", async () => {
    const fluxHooks = createArchetypeHooks(archetypeRegistry, () => {}, {
      messages: async () => [{ info: { role: "user", agent: "flux" }, parts: [] }],
    })
    const fluxOutput = { context: [] as string[] }
    await fluxHooks["experimental.session.compacting"]?.({ sessionID: "session-flux" }, fluxOutput)
    expect(fluxOutput.context).toEqual([])

    const cortexHooks = createArchetypeHooks(archetypeRegistry, () => {}, {
      messages: async () => [{
        info: { role: "user", agent: "cortex" },
        parts: [{
          type: "tool",
          tool: "command_run",
          state: { status: "completed", metadata: { taskStatus: { version: 1, task_group: "bad", task_type: ["unknown"], status: "doing" } } },
        }],
      }],
    })
    const cortexOutput = { context: [] as string[] }
    await cortexHooks["experimental.session.compacting"]?.({ sessionID: "session-cortex" }, cortexOutput)
    expect(cortexOutput.context).toHaveLength(1)
    expect(cortexOutput.context[0]).not.toContain("UNTRUSTED MODEL-AUTHORED TASK CHECKPOINT")
  })
})
