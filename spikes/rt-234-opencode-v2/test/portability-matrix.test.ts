import { describe, expect, test } from "bun:test"

import { roleSourceSchema } from "../src/role-schema.ts"
import { representativeRoles } from "./fixtures.ts"

const role = representativeRoles[0]!

describe("schema portability matrix", () => {
  test("rejects machine paths, timestamps, and synthetic credential shapes", () => {
    const rejected = [
      "/opt/example/config.json",
      "Path:/opt/example/config.json",
      "C:/Users/example/config.json",
      String.raw`C:\Users\example\config.json`,
      "~/example/config.json",
      String.raw`~\example\config.json`,
      "//server/share/config.json",
      String.raw`\\server\share\config.json`,
      "[/opt/example/config.json]",
      "docs first,/opt/example/config.json",
      "2026-07-17T04:00:00Z",
      "2026-07-17 04:00:00Z",
      `sk-${"x".repeat(20)}`,
      `AKIA${"A".repeat(16)}`,
      `ghp_${"x".repeat(36)}`,
      `github_pat_${"x".repeat(82)}`,
      "-----BEGIN PRIVATE KEY-----",
    ]

    for (const taskAdditions of rejected) {
      expect(parseTask(taskAdditions)).toBe(false)
    }
  })

  test("accepts HTTPS, repository-relative locators, and non-path slashes", () => {
    const accepted = [
      "See https://opencode.ai/docs/permissions/.",
      "Read docs/policy.md.",
      "Compare a 1/2 ratio.",
    ]

    for (const taskAdditions of accepted) {
      expect(parseTask(taskAdditions)).toBe(true)
    }
  })
})

function parseTask(taskAdditions: string): boolean {
  return roleSourceSchema.safeParse({
    ...role,
    prompts: { ...role.prompts, taskAdditions },
  }).success
}
