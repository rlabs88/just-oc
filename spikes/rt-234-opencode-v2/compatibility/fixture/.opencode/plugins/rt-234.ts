import { createArchetypesPlugin } from "../../../../src/plugin.ts"
import { compilerInput } from "../../../../test/fixtures.ts"

const harness = createArchetypesPlugin({
  sharedPrompts: compilerInput.sharedPrompts,
  registry: compilerInput.registry,
  overlays: compilerInput.overlays,
  pins: compilerInput.pins,
})

export default harness.plugin
