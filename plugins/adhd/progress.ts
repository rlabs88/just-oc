/**
 * Staged progress reporting.
 *
 * A run is eleven dispatches over thirty to ninety seconds. Without this it is a
 * single silent tool call, and a caller cannot distinguish "diverging" from
 * "wedged". Upstream's CLI streams the same event set to a terminal renderer;
 * this maps it onto the two surfaces OpenCode actually has.
 *
 *   - `metadata()` rewrites the tool call's own title in place — always
 *     available, never noisy, and the primary signal.
 *   - `tui.showToast` fires at phase boundaries only. It reaches a TUI when one
 *     is attached and is harmless when none is; toasting every frame would turn
 *     a five-frame run into five interruptions.
 *
 * Every event is also appended to a log returned in the final metadata, so a run
 * stays inspectable after the titles have scrolled away.
 */

import type { RunEvent } from "./types"

export type ToastVariant = "info" | "success" | "warning" | "error"

export type ToastClient = {
  tui: {
    showToast: (args: {
      body: { title?: string; message: string; variant: ToastVariant; duration?: number }
    }) => Promise<unknown>
  }
}

export type ProgressMode = "verbose" | "quiet"

export type ProgressReporter = {
  handle: (event: RunEvent) => void
  /** Human-readable trace of the run, oldest first. */
  log: () => string[]
  finish: (summary: string) => void
}

export type ProgressOptions = {
  mode: ProgressMode
  framesPlanned: number
  topK: number
  setTitle: (title: string) => void
  toast?: (message: string, variant: ToastVariant) => void
}

const TOAST_TITLE = "ADHD"

export function createProgressReporter(options: ProgressOptions): ProgressReporter {
  const { mode, framesPlanned, topK, setTitle, toast } = options
  const log: string[] = []

  let framesDone = 0
  let framesFailed = 0
  let ideas = 0
  let deepened = 0

  const record = (line: string) => log.push(line)

  const announce = (message: string, variant: ToastVariant = "info") => {
    if (mode === "quiet") return
    toast?.(message, variant)
  }

  const handle = (event: RunEvent) => {
    switch (event.kind) {
      case "reframe:done": {
        const line = event.changed
          ? "reframe · incidental anchors stripped"
          : "reframe · problem unchanged"
        record(line)
        setTitle(`adhd · ${line}`)
        announce(
          event.changed
            ? "Anchors stripped — diverging from the underlying problem"
            : "No anchors to strip — diverging from the problem as stated",
        )
        break
      }

      case "frame:start": {
        record(`diverge · start ${event.frameLabel}`)
        // Title tracks completions, not starts: with concurrency several frames
        // are in flight at once and a start-count runs ahead of real progress.
        setTitle(`adhd · diverging ${framesDone}/${framesPlanned} · ${event.frameLabel}`)
        break
      }

      case "frame:done": {
        framesDone++
        ideas += event.count
        record(`diverge · ${event.frameId} returned ${event.count} ideas`)
        setTitle(`adhd · diverging ${framesDone}/${framesPlanned} · ${ideas} ideas`)
        if (framesDone + framesFailed === framesPlanned) {
          announce(`Divergence complete — ${ideas} ideas across ${framesDone} frames`)
        }
        break
      }

      case "frame:failed": {
        framesFailed++
        record(`diverge · ${event.frameId} FAILED — ${event.reason}`)
        setTitle(`adhd · diverging ${framesDone}/${framesPlanned} · ${framesFailed} failed`)
        announce(`Frame ${event.frameId} failed — ${event.reason}`, "warning")
        if (framesDone + framesFailed === framesPlanned) {
          announce(`Divergence complete — ${ideas} ideas across ${framesDone} frames`)
        }
        break
      }

      case "score:done": {
        record(`score · ${event.total} ideas scored`)
        setTitle(`adhd · scored ${event.total} ideas`)
        announce(`Scoring complete — ${event.total} candidates ranked`)
        break
      }

      case "trap:fallback": {
        const line = `score · critic trapped all ${event.trapped} candidates — ranking the trapped set`
        record(line)
        setTitle(`adhd · every candidate trapped (${event.trapped})`)
        announce(
          `Critic flagged all ${event.trapped} candidates as traps — shortlist entries all carry a named cost`,
          "warning",
        )
        break
      }

      case "cluster:done": {
        record(`cluster · ${event.clusters} clusters`)
        setTitle(`adhd · ${event.clusters} clusters`)
        break
      }

      case "deepen:start": {
        record(`deepen · ${event.text}`)
        setTitle(`adhd · deepening ${deepened + 1}/${topK}`)
        break
      }

      case "deepen:done": {
        deepened++
        setTitle(`adhd · deepened ${deepened}/${topK}`)
        break
      }

      case "deepen:failed": {
        record(`deepen · ${event.ideaId} FAILED — ${event.reason}`)
        announce(`A deepen pass failed — ${event.reason}`, "warning")
        break
      }
    }
  }

  return {
    handle,
    log: () => [...log],
    finish: (summary) => {
      record(`done · ${summary}`)
      setTitle(`adhd · ${summary}`)
      announce(`Run complete — ${summary}`, "success")
    },
  }
}

/** Best-effort toast. A missing or failing TUI must never break a run. */
export function toastSink(client: Partial<ToastClient>) {
  return (message: string, variant: ToastVariant) => {
    void Promise.resolve()
      .then(() =>
        client.tui?.showToast({
          body: { title: TOAST_TITLE, message, variant, duration: 4000 },
        }),
      )
      .catch(() => {})
  }
}
