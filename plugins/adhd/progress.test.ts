import { describe, expect, test } from "bun:test"
import { createProgressReporter, toastSink, type ToastVariant } from "./progress"
import type { RunEvent } from "./types"

function harness(mode: "verbose" | "quiet" = "verbose", framesPlanned = 3, topK = 2) {
  const titles: string[] = []
  const toasts: Array<{ message: string; variant: ToastVariant }> = []
  const reporter = createProgressReporter({
    mode,
    framesPlanned,
    topK,
    setTitle: (title) => titles.push(title),
    toast: (message, variant) => toasts.push({ message, variant }),
  })
  return { reporter, titles, toasts }
}

const feed = (reporter: { handle: (e: RunEvent) => void }, events: RunEvent[]) =>
  events.forEach((event) => reporter.handle(event))

const fullRun: RunEvent[] = [
  { kind: "reframe:done", changed: true },
  { kind: "frame:start", frameId: "a", frameLabel: "On-call at 3am" },
  { kind: "frame:start", frameId: "b", frameLabel: "Logistics" },
  { kind: "frame:done", frameId: "a", count: 6 },
  { kind: "frame:start", frameId: "c", frameLabel: "Inversion" },
  { kind: "frame:done", frameId: "b", count: 5 },
  { kind: "frame:done", frameId: "c", count: 4 },
  { kind: "score:done", total: 15 },
  { kind: "cluster:done", clusters: 4 },
  { kind: "deepen:start", ideaId: "i1", text: "shed load, serve stale" },
  { kind: "deepen:done", ideaId: "i1" },
  { kind: "deepen:start", ideaId: "i2", text: "windowed batch reads" },
  { kind: "deepen:done", ideaId: "i2" },
]

describe("title reporting", () => {
  test("reports every phase of a run", () => {
    const { reporter, titles } = harness()
    feed(reporter, fullRun)
    reporter.finish("15 ideas across 3 frames · 4 clusters · 0 traps")

    const joined = titles.join("\n")
    expect(joined).toContain("anchors stripped")
    expect(joined).toContain("diverging")
    expect(joined).toContain("scored 15 ideas")
    expect(joined).toContain("4 clusters")
    expect(joined).toContain("deepening")
    expect(titles.at(-1)).toContain("15 ideas across 3 frames")
  })

  test("the divergence counter tracks completions, not starts", () => {
    const { reporter, titles } = harness()
    feed(reporter, [
      { kind: "frame:start", frameId: "a", frameLabel: "A" },
      { kind: "frame:start", frameId: "b", frameLabel: "B" },
      { kind: "frame:start", frameId: "c", frameLabel: "C" },
    ])

    // Three frames in flight, none finished. A start-count would read 3/3 here
    // and claim the phase was done before a single branch had returned.
    for (const title of titles) expect(title).toContain("0/3")
  })

  test("counts ideas as branches land", () => {
    const { reporter, titles } = harness()
    feed(reporter, [
      { kind: "frame:done", frameId: "a", count: 6 },
      { kind: "frame:done", frameId: "b", count: 5 },
    ])
    expect(titles.at(-1)).toContain("2/3")
    expect(titles.at(-1)).toContain("11 ideas")
  })

  test("deepen progress counts against topK", () => {
    const { reporter, titles } = harness("verbose", 3, 2)
    feed(reporter, [
      { kind: "deepen:start", ideaId: "i1", text: "x" },
      { kind: "deepen:done", ideaId: "i1" },
      { kind: "deepen:start", ideaId: "i2", text: "y" },
    ])
    expect(titles).toContain("adhd · deepening 1/2")
    expect(titles).toContain("adhd · deepening 2/2")
  })
})

describe("toasts", () => {
  test("fire at phase boundaries, not per frame", () => {
    const { reporter, toasts } = harness()
    feed(reporter, fullRun)
    reporter.finish("done")

    // reframe · divergence complete · scoring complete · run complete
    expect(toasts.length).toBe(4)
    expect(toasts.at(-1)?.variant).toBe("success")
  })

  test("divergence completion fires once, after the last branch", () => {
    const { reporter, toasts } = harness()
    feed(reporter, [
      { kind: "frame:done", frameId: "a", count: 2 },
      { kind: "frame:done", frameId: "b", count: 2 },
    ])
    expect(toasts.length).toBe(0)

    reporter.handle({ kind: "frame:done", frameId: "c", count: 2 })
    const complete = toasts.filter((t) => t.message.includes("Divergence complete"))
    expect(complete.length).toBe(1)
    expect(complete[0]!.message).toContain("6 ideas across 3 frames")
  })

  test("a failed frame warns and still closes the phase", () => {
    const { reporter, toasts } = harness()
    feed(reporter, [
      { kind: "frame:done", frameId: "a", count: 2 },
      { kind: "frame:done", frameId: "b", count: 2 },
      { kind: "frame:failed", frameId: "c", reason: "provider hiccup" },
    ])

    expect(toasts.some((t) => t.variant === "warning" && t.message.includes("provider hiccup"))).toBe(true)
    expect(toasts.some((t) => t.message.includes("Divergence complete"))).toBe(true)
  })

  test("quiet mode suppresses toasts but keeps titles and the log", () => {
    const { reporter, titles, toasts } = harness("quiet")
    feed(reporter, fullRun)
    reporter.finish("done")

    expect(toasts.length).toBe(0)
    expect(titles.length).toBeGreaterThan(0)
    expect(reporter.log().length).toBeGreaterThan(0)
  })
})

describe("run log", () => {
  test("records every phase in order", () => {
    const { reporter } = harness()
    feed(reporter, fullRun)
    reporter.finish("summary")

    const log = reporter.log()
    expect(log[0]).toContain("reframe")
    expect(log.filter((l) => l.startsWith("diverge ·")).length).toBe(6)
    expect(log.some((l) => l.startsWith("score ·"))).toBe(true)
    expect(log.some((l) => l.startsWith("cluster ·"))).toBe(true)
    expect(log.at(-1)).toBe("done · summary")
  })

  test("records a frame failure with its reason", () => {
    const { reporter } = harness()
    reporter.handle({ kind: "frame:failed", frameId: "c", reason: "bad json" })
    expect(reporter.log()[0]).toContain("FAILED — bad json")
  })

  test("is a copy, not the live array", () => {
    const { reporter } = harness()
    reporter.handle({ kind: "score:done", total: 1 })
    const first = reporter.log()
    first.push("tampered")
    expect(reporter.log()).not.toContain("tampered")
  })
})

describe("toast sink resilience", () => {
  test("a client with no TUI does not throw", () => {
    expect(() => toastSink({})("hello", "info")).not.toThrow()
  })

  test("a rejecting TUI does not surface an unhandled rejection", async () => {
    const sink = toastSink({
      tui: { showToast: async () => { throw new Error("no tui attached") } },
    })
    expect(() => sink("hello", "info")).not.toThrow()
    await new Promise((resolve) => setTimeout(resolve, 5))
  })

  test("a synchronously throwing TUI is contained", async () => {
    const sink = toastSink({
      tui: { showToast: (() => { throw new Error("boom") }) as never },
    })
    expect(() => sink("hello", "info")).not.toThrow()
    await new Promise((resolve) => setTimeout(resolve, 5))
  })
})
