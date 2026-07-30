export * from "./types"

// `manager-interface.ts` is the contract the tools are written against;
// `manager.ts` is the implementation the plugin entry point wires in.
export type { BackgroundManager } from "./manager-interface"
export { SessionBackgroundManager, type BackgroundManagerClient } from "./manager"
