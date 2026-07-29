import { describe, expect, test } from "bun:test"
import { validateRetainedCompatibility, type CompatibilityManifest } from "./probe"

const image: CompatibilityManifest = {
  compatibilityVersion: 1,
  stateSchema: 1,
  workspaceSchema: 1,
  openCodeVersion: "1.17.5",
  build: { createdAt: "test", revision: "test", source: "test" },
}

describe("retained sandbox compatibility", () => {
  test("accepts fresh empty state", async () => {
    await expect(validateRetainedCompatibility({ image, stateHasData: false, workspaceHasData: false })).resolves.toBeUndefined()
  })

  test("fails closed when non-empty retained data lacks metadata", async () => {
    await expect(validateRetainedCompatibility({ image, stateHasData: true, workspaceHasData: false })).rejects.toThrow("no compatibility metadata")
  })

  test("rejects an unsupported schema", async () => {
    await expect(validateRetainedCompatibility({
      image,
      retained: { ...image, workspaceSchema: 2 },
      stateHasData: true,
      workspaceHasData: true,
    })).rejects.toThrow("workspace checkpoint schema")
  })
})
