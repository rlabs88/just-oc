export * from "./types"

// BackgroundManager is exported from manager.ts but has deep dependency chains.
// For now, re-export the type interface that the tools need.
// The actual BackgroundManager implementation is in manager.ts (kept as reference)
// and will be wired up via the plugin entry point.
export type { BackgroundManager } from "./manager-interface"
