export type Domain =
  | "session"
  | "pane"
  | "tab"
  | "pipe"
  | "plugin"
  | "layout"
  | "utility"
  | "detection"
  | "exec"

export type Params = Record<string, unknown>

export type DomainHandler = (action: string, params: Params) => Promise<string>
