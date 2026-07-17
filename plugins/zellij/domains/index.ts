import type { Domain, DomainHandler } from "../types"
import { handleSession } from "./session"
import { handlePane } from "./pane"
import { handleTab } from "./tab"
import { handlePipe } from "./pipe"
import { handlePlugin } from "./plugin"
import { handleLayout } from "./layout"
import { handleUtility } from "./utility"
import { handleDetection } from "./detection"
import { handleExec } from "./exec"

export const domainHandlers: Record<Domain, DomainHandler> = {
  session: handleSession,
  pane: handlePane,
  tab: handleTab,
  pipe: handlePipe,
  plugin: handlePlugin,
  layout: handleLayout,
  utility: handleUtility,
  detection: handleDetection,
  exec: handleExec,
}
