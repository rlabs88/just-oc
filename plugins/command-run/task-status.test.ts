import { describe, expect, test } from "bun:test"
import { executeAdapter } from "./adapters"
import type { ParsedCommand } from "./types"

function taskStatus(commandLine: string): ParsedCommand {
  return {
    command_type: "task_status",
    command_line: commandLine,
    step: 1,
    inputIndex: 0,
  }
}

describe("task_status", () => {
  test("accepts a complete allowlisted manual set without forcing a checkpoint", async () => {
    const result = await executeAdapter(taskStatus(JSON.stringify({
      task_group: "agent prompt engineering",
      task_type: ["implementation", "refactoring", "review"],
      status: "doing",
    })), process.cwd(), AbortSignal.timeout(1_000))

    expect(result.metadata?.taskStatus).toEqual({
      version: 1,
      task_group: "agent prompt engineering",
      task_type: ["implementation", "refactoring", "review"],
      status: "doing",
    })
  })

  test("rejects duplicate or unsupported manuals", async () => {
    const duplicate = executeAdapter(taskStatus(JSON.stringify({
      task_group: "prompt work",
      task_type: ["implementation", "implementation"],
      status: "doing",
    })), process.cwd(), AbortSignal.timeout(1_000))
    await expect(duplicate).rejects.toThrow("task_type must contain unique supported values")

    const unsupported = executeAdapter(taskStatus(JSON.stringify({
      task_group: "prompt work",
      task_type: ["implementation", "deployment_to_everywhere"],
      status: "doing",
    })), process.cwd(), AbortSignal.timeout(1_000))
    await expect(unsupported).rejects.toThrow("task_type must contain unique supported values")
  })

  test("normalizes a legacy single manual and preserves a bounded phase checkpoint", async () => {
    const result = await executeAdapter(taskStatus(JSON.stringify({
      task_group: "debugging",
      task_type: "debugging",
      status: "question",
      compact_context: "Reproduction is stable; the next action is to inspect the parser boundary.",
    })), process.cwd(), AbortSignal.timeout(1_000))

    expect(result.metadata?.taskStatus).toEqual({
      version: 1,
      task_group: "debugging",
      task_type: ["debugging"],
      status: "question",
      compact_context: "Reproduction is stable; the next action is to inspect the parser boundary.",
    })
  })
})
