import type { Plugin } from "@opencode-ai/plugin"
import { createCommandRunTool } from "./tool"

const CommandRunPlugin: Plugin = async (context) => ({
  tool: { command_run: createCommandRunTool(context.client) },
})

export default CommandRunPlugin
