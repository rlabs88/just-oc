/**
 * Background task lifecycle.
 *
 * The manager owns task state and nothing else: it opens a child session per
 * task, starts the prompt without awaiting it, and records the outcome when it
 * settles. Execution, permissions, and the agent loop stay with OpenCode — the
 * manager only projects what it observes into a serializable task record.
 */

import {
  createDispatchSession,
  runDispatchPrompt,
  type DispatchClient,
} from "../../shared/dispatch"
import { log } from "../../shared/logger"
import type { BackgroundManager } from "./manager-interface"
import type { BackgroundTask, LaunchInput } from "./types"

export type BackgroundManagerClient = DispatchClient & {
  session: { abort: (args: { path: { id: string } }) => Promise<unknown> }
}

export class SessionBackgroundManager implements BackgroundManager {
  private tasks = new Map<string, BackgroundTask>()
  private taskCounter = 0

  constructor(private readonly client: BackgroundManagerClient) {}

  async launch(input: LaunchInput): Promise<BackgroundTask> {
    const id = `bg_${++this.taskCounter}_${Date.now()}`
    const task: BackgroundTask = {
      id,
      parentSessionID: input.parentSessionID,
      parentMessageID: input.parentMessageID,
      description: input.description,
      prompt: input.prompt,
      agent: input.agent,
      parentModel: input.parentModel,
      parentAgent: input.parentAgent,
      status: "pending",
      queuedAt: new Date(),
    }
    this.tasks.set(id, task)

    // The session must exist before launch returns — the tool reports its id to
    // the caller, and a task with no session cannot be inspected or cancelled.
    try {
      task.sessionID = await createDispatchSession(this.client, {
        parentSessionID: input.parentSessionID,
        title: input.description,
      })
    } catch (error) {
      task.status = "error"
      task.error = error instanceof Error ? error.message : String(error)
      task.completedAt = new Date()
      log("[background_task] session creation failed", { id, error: task.error })
      return task
    }

    task.status = "running"
    task.startedAt = new Date()

    // Deliberately not awaited: the caller gets its task id back now, and the
    // task settles on its own. A rejection here is recorded, never rethrown into
    // an unhandled position.
    void this.settle(task, input)

    return task
  }

  private async settle(task: BackgroundTask, input: LaunchInput): Promise<void> {
    try {
      const text = await runDispatchPrompt(this.client, task.sessionID!, {
        prompt: input.prompt,
        agent: input.agent,
        ...(input.model
          ? { model: { providerID: input.model.providerID, modelID: input.model.modelID } }
          : input.parentModel
            ? { model: input.parentModel }
            : {}),
      })
      // A cancel that landed mid-flight owns the final status.
      if (task.status !== "running") return
      task.status = "completed"
      task.result = text
    } catch (error) {
      if (task.status !== "running") return
      task.status = "error"
      task.error = error instanceof Error ? error.message : String(error)
      log("[background_task] task failed", { id: task.id, error: task.error })
    } finally {
      task.completedAt = new Date()
    }
  }

  getTask(taskId: string): BackgroundTask | undefined {
    return this.tasks.get(taskId)
  }

  getAllDescendantTasks(sessionID: string): BackgroundTask[] {
    return Array.from(this.tasks.values()).filter((t) => t.parentSessionID === sessionID)
  }

  async cancelTask(
    taskId: string,
    options: { source: string; abortSession?: boolean; skipNotification?: boolean },
  ): Promise<boolean> {
    const task = this.tasks.get(taskId)
    if (!task) return false
    if (task.status !== "running" && task.status !== "pending") return false

    if (options.abortSession && task.sessionID) {
      try {
        await this.client.session.abort({ path: { id: task.sessionID } })
      } catch (error) {
        log("[background_cancel] abort failed", {
          id: taskId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    task.status = "cancelled"
    task.completedAt = new Date()
    return true
  }
}
