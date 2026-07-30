import type { Plugin } from "@opencode-ai/plugin"
import { createAdhdTool, type AdhdClient } from "./tool"

export { run, buildDivergeBrief, type BranchDispatch } from "./engine"
export { FRAMES, selectFrames, type Frame } from "./frames"
export { dispatchAgent, NO_TOOLS, type DispatchClient } from "./dispatch"
export { createProgressReporter, type ProgressMode } from "./progress"
export * from "./types"

const AdhdPlugin: Plugin = async (ctx) => {
  return {
    tool: {
      adhd_run: createAdhdTool(ctx.client as unknown as AdhdClient),
    },
  }
}

export default AdhdPlugin
