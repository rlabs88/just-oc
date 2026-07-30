import { describe, expect, test } from "bun:test"
import { AGENT_TOOLS_INSTALL_ROOT, agentToolPackageJson } from "./agent-tools"

describe("agent CLI install surface", () => {
  test("resolves package metadata from the npm ci install root", () => {
    expect(AGENT_TOOLS_INSTALL_ROOT).toBe("/opt/agent-tools/node_modules")
    expect(agentToolPackageJson("@openai/codex"))
      .toBe("/opt/agent-tools/node_modules/@openai/codex/package.json")
  })

  test("rejects paths that can escape the frozen install root", () => {
    expect(() => agentToolPackageJson("../package")) .toThrow()
    expect(() => agentToolPackageJson("/tmp/package")) .toThrow()
  })
})
