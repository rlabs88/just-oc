export type ToastStatus = "complete" | "failed" | "cancelled"

type NotifierInput = {
  directory: string
  showToast?: (input: {
    body: { message: string; variant: "success" | "error" | "warning" }
    query: { directory: string }
  }) => Promise<unknown>
}

export function createNotifier(input: NotifierInput): {
  final(status: ToastStatus, message: string): Promise<void>
} {
  return {
    async final(status, message) {
      if (!input.showToast) return
      try {
        await input.showToast({
          body: { message, variant: variantFor(status) },
          query: { directory: input.directory },
        })
      } catch {
        // Metadata and the ordered result remain authoritative when no compatible TUI is attached.
      }
    },
  }
}

function variantFor(status: ToastStatus): "success" | "error" | "warning" {
  if (status === "complete") return "success"
  if (status === "failed") return "error"
  return "warning"
}
