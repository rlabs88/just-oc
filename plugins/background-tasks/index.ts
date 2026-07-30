import type { Plugin } from "@opencode-ai/plugin"
import {
  createBackgroundTask,
  createBackgroundOutput,
  createBackgroundCancel,
} from "./tools"
import { SessionBackgroundManager, type BackgroundManagerClient } from "./features/background-agent/manager"

export { SessionBackgroundManager } from "./features/background-agent/manager"

const BackgroundTaskPlugin: Plugin = async (ctx) => {
  const manager = new SessionBackgroundManager(ctx.client as unknown as BackgroundManagerClient)

  return {
    tool: {
      background_task: createBackgroundTask(manager, ctx.client),
      background_output: createBackgroundOutput(manager, ctx.client),
      background_cancel: createBackgroundCancel(manager, ctx.client),
    },
  }
}

export default BackgroundTaskPlugin
