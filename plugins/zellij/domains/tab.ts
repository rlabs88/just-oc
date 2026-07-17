import { execZellij, sanitize } from "../exec"
import type { Params } from "../types"

export async function handleTab(action: string, params: Params): Promise<string> {
  switch (action) {
    case "new": {
      let cmd = "action new-tab"
      if (params.name) cmd += ` --name "${sanitize(params.name)}"`
      if (params.layout) cmd += ` --layout ${sanitize(params.layout)}`
      return execZellij(cmd)
    }

    case "close":
      return execZellij("action close-tab")

    case "rename": {
      const name = sanitize(params.name)
      if (!name) return "[ERROR] tab.rename requires params.name"
      return execZellij(`action rename-tab "${name}"`)
    }

    case "undo_rename":
      return execZellij("action undo-rename-tab")

    case "go_to": {
      const index = params.index != null ? Number(params.index) : undefined
      if (index == null || isNaN(index)) return "[ERROR] tab.go_to requires params.index (number)"
      return execZellij(`action go-to-tab ${index}`)
    }

    case "go_to_name": {
      const name = sanitize(params.name)
      if (!name) return "[ERROR] tab.go_to_name requires params.name"
      return execZellij(`action go-to-tab-name "${name}"`)
    }

    case "move": {
      const dir = sanitize(params.direction)
      if (!dir) return "[ERROR] tab.move requires params.direction (left|right)"
      return execZellij(`action move-tab ${dir}`)
    }

    case "query_names":
      return execZellij("action query-tab-names")

    case "toggle_sync":
      return execZellij("action toggle-active-sync-tab")

    case "next":
      return execZellij("action go-to-next-tab")

    case "previous":
      return execZellij("action go-to-previous-tab")

    default:
      return `[ERROR] Unknown tab action: "${action}". Valid: new, close, rename, undo_rename, go_to, go_to_name, move, query_names, toggle_sync, next, previous`
  }
}
