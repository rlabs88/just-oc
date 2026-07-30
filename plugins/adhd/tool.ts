import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { dispatchAgent, NO_TOOLS, type DispatchClient } from "./dispatch"
import { run, type BranchDispatch } from "./engine"
import { createProgressReporter, toastSink, type ProgressMode, type ToastClient } from "./progress"
import { DEFAULTS, type RunResult } from "./types"

export type AdhdClient = DispatchClient & Partial<ToastClient>

const TOOL_DESCRIPTION = `Parallel divergent ideation. Fans out N isolated subagent branches under different cognitive frames, scores them, clusters by underlying angle, prunes traps, and deepens the survivors.

Each branch is its own OpenCode session and cannot see any sibling's output — the isolation is structural, not a promise. Returns structured JSON (branches, clusters, shortlist, nonObviousPick, traps, deepened, provocation), not prose.

Costs roughly ${DEFAULTS.framesPerRun + DEFAULTS.topK + 3} agent dispatches. Worth it for architecture, a public interface or schema, a name that outlives the session, a direction-setting choice, or a fuzzy failure where hypotheses have run out. Not for lookups, bugs with a known cause, or closed phrasing.

Hand it the underlying job to be done, not the current implementation — pass stack, code, and constraints through \`context\` instead, so they do not narrow every branch at once.`

/**
 * Sessions opened as ADHD branches.
 *
 * The fan-out ceiling is one level. `NO_TOOLS` already denies a branch the tool,
 * so this is the second of two independent stops: even if a branch somehow
 * reached `adhd_run`, its session id is known and the call is refused.
 */
const branchSessions = new Set<string>()

function parseModel(value: string | undefined): { providerID: string; modelID: string } | undefined {
  if (!value) return undefined
  const separator = value.indexOf("/")
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error(`model must be "providerID/modelID", got "${value}"`)
  }
  return { providerID: value.slice(0, separator), modelID: value.slice(separator + 1) }
}

function summarize(result: RunResult): string {
  const ideas = result.branches.reduce((total, branch) => total + branch.ideas.length, 0)
  const failed = result.branches.filter((branch) => branch.failed).length
  const parts = [
    `${ideas} ideas across ${result.branches.length} frames`,
    `${result.clusters.length} clusters`,
    `${result.traps.length} traps`,
  ]
  if (failed > 0) parts.push(`${failed} frame(s) failed`)
  return parts.join(" · ")
}

export function createAdhdTool(client: AdhdClient): ToolDefinition {
  return tool({
    description: TOOL_DESCRIPTION,
    args: {
      problem: tool.schema
        .string()
        .describe("The underlying job to be done. Not the current implementation."),
      context: tool.schema
        .string()
        .optional()
        .describe("Code, constraints, and stack. Kept out of the problem so it does not anchor every branch."),
      framesPerRun: tool.schema
        .number()
        .int()
        .min(1)
        .max(12)
        .optional()
        .describe(`Cognitive frames to fan out over (default ${DEFAULTS.framesPerRun})`),
      ideasPerFrame: tool.schema
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe(`Ideas each branch generates (default ${DEFAULTS.ideasPerFrame})`),
      topK: tool.schema
        .number()
        .int()
        .min(1)
        .max(8)
        .optional()
        .describe(`Survivors to deepen (default ${DEFAULTS.topK})`),
      concurrency: tool.schema
        .number()
        .int()
        .min(1)
        .max(12)
        .optional()
        .describe(`Branches dispatched at once (default ${DEFAULTS.concurrency})`),
      codeMode: tool.schema
        .boolean()
        .optional()
        .describe(`Bias frame selection toward engineering vantages (default ${DEFAULTS.codeMode})`),
      stripAnchors: tool.schema
        .boolean()
        .optional()
        .describe(
          `Strip incidental anchors from the problem before fan-out; real constraints are kept (default ${DEFAULTS.stripAnchors})`,
        ),
      agent: tool.schema.string().optional().describe("Agent the branch dispatches run as"),
      model: tool.schema
        .string()
        .optional()
        .describe('Generator model as "providerID/modelID"'),
      criticModel: tool.schema
        .string()
        .optional()
        .describe(
          'Critic model as "providerID/modelID". A different family decorrelates critic error from generator error.',
        ),
      progress: tool.schema
        .enum(["verbose", "quiet"])
        .optional()
        .describe(
          "verbose (default) reports each phase as it completes; quiet suppresses the notifications but still records the run log",
        ),
    },
    async execute(args, context) {
      if (branchSessions.has(context.sessionID)) {
        return `[ERROR] Refused: one level of fan-out is the ceiling. This session is an ADHD branch, and a branch does not start another run.`
      }

      let model: { providerID: string; modelID: string } | undefined
      let criticModel: { providerID: string; modelID: string } | undefined
      try {
        model = parseModel(args.model)
        criticModel = parseModel(args.criticModel)
      } catch (error) {
        return `[ERROR] ${error instanceof Error ? error.message : String(error)}`
      }

      const dispatch: BranchDispatch = async (input) => {
        if (context.abort?.aborted) throw new Error("run aborted")
        const result = await dispatchAgent(client, {
          parentSessionID: context.sessionID,
          title: input.title,
          system: input.system,
          prompt: input.prompt,
          ...(args.agent ? { agent: args.agent } : {}),
          ...(input.model ? { model: input.model } : {}),
          // No tools: divergence is pure generation, and a branch with no tools
          // cannot re-enter the engine.
          tools: NO_TOOLS,
        })
        branchSessions.add(result.sessionID)
        return result.text
      }

      const mode: ProgressMode = args.progress ?? "verbose"
      const progress = createProgressReporter({
        mode,
        framesPlanned: args.framesPerRun ?? DEFAULTS.framesPerRun,
        topK: args.topK ?? DEFAULTS.topK,
        setTitle: (title) => context.metadata?.({ title }),
        toast: toastSink(client),
      })

      context.metadata?.({ title: "adhd · starting" })

      try {
        const result = await run(dispatch, {
          problem: args.problem,
          context: args.context,
          framesPerRun: args.framesPerRun,
          ideasPerFrame: args.ideasPerFrame,
          topK: args.topK,
          concurrency: args.concurrency,
          codeMode: args.codeMode,
          stripAnchors: args.stripAnchors,
          model,
          criticModel,
          onEvent: progress.handle,
        })

        const summary = summarize(result)
        progress.finish(summary)

        return {
          title: `adhd: ${summary}`,
          output: JSON.stringify(result, null, 2),
          metadata: {
            frames: result.branches.length,
            ideas: result.branches.reduce((total, branch) => total + branch.ideas.length, 0),
            clusters: result.clusters.length,
            traps: result.traps.length,
            failedFrames: result.branches.filter((branch) => branch.failed).length,
            progress: progress.log(),
          },
        }
      } catch (error) {
        // Surfaced as a clean failure Flux can report — never a fabricated result.
        const message = error instanceof Error ? error.message : String(error)
        context.metadata?.({ title: "adhd · failed", metadata: { progress: progress.log() } })
        if (mode === "verbose") toastSink(client)(`Run failed — ${message}`, "error")
        return `[ERROR] ADHD run failed: ${message}\n\nProgress before failure:\n${progress
          .log()
          .map((line) => `  ${line}`)
          .join("\n")}`
      }
    },
  })
}

/** Test seam — the branch registry is module state and must not leak across runs. */
export function resetBranchSessions(): void {
  branchSessions.clear()
}
