import type { Plugin } from "@opencode-ai/plugin"
import { createZellijTool } from "./tool"

const ZellijPlugin: Plugin = async (_ctx) => {
  return {
    tool: {
      zellij: createZellijTool(),
    },
  }
}

export default ZellijPlugin
