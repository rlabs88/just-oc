import type { BackgroundTask, LaunchInput } from "./types"

/**
 * Interface for BackgroundManager as required by the background task tools.
 * The full implementation lives in manager.ts (copied from oh-my-openagent).
 * This interface extracts only the methods used by the tool definitions.
 */
export interface BackgroundManager {
  launch(input: LaunchInput): Promise<BackgroundTask>
  getTask(taskId: string): BackgroundTask | undefined
  getAllDescendantTasks(sessionID: string): BackgroundTask[]
  cancelTask(
    taskId: string,
    options: {
      source: string
      abortSession?: boolean
      skipNotification?: boolean
    }
  ): Promise<boolean>
}
