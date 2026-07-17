import { execZellij, sanitize } from "../exec"
import type { Params } from "../types"

export async function handlePane(action: string, params: Params): Promise<string> {
  switch (action) {
    case "new": {
      let cmd = "action new-pane"
      if (params.direction) cmd += ` --direction ${sanitize(params.direction)}`
      if (params.cwd) cmd += ` --cwd ${sanitize(params.cwd)}`
      if (params.command) cmd += ` -- ${sanitize(params.command)}`
      return execZellij(cmd)
    }

    case "close":
      return execZellij("action close-pane")

    case "focus": {
      const dir = sanitize(params.direction)
      if (!dir) return "[ERROR] pane.focus requires params.direction (left|right|up|down|next|previous)"
      if (dir === "next") return execZellij("action focus-next-pane")
      if (dir === "previous") return execZellij("action focus-previous-pane")
      return execZellij(`action move-focus ${dir}`)
    }

    case "resize": {
      const dir = sanitize(params.direction)
      const amount = sanitize(params.amount)
      if (!dir || !amount) return "[ERROR] pane.resize requires params.direction (left|right|up|down) and params.amount (increase|decrease)"
      return execZellij(`action resize ${amount} ${dir}`)
    }

    case "scroll": {
      const dir = sanitize(params.direction)
      if (!dir) return "[ERROR] pane.scroll requires params.direction (up|down)"
      const amount = sanitize(params.amount) || "line"
      if (amount === "half-page") return execZellij(`action half-page-scroll-${dir}`)
      if (amount === "page") return execZellij(`action page-scroll-${dir}`)
      return execZellij(`action scroll-${dir}`)
    }

    case "scroll_to_edge": {
      const edge = sanitize(params.edge)
      if (!edge) return "[ERROR] pane.scroll_to_edge requires params.edge (top|bottom)"
      return execZellij(`action scroll-to-${edge}`)
    }

    case "toggle_floating":
      return execZellij("action toggle-floating-panes")

    case "toggle_fullscreen":
      return execZellij("action toggle-fullscreen")

    case "toggle_embed_float":
      return execZellij("action toggle-pane-embed-or-floating")

    case "pin":
      return execZellij("action pin-pane")

    case "toggle_frames":
      return execZellij("action toggle-pane-frames")

    case "clear":
      return execZellij("action clear")

    case "dump_screen": {
      const output = params.output_path ? sanitize(params.output_path) : undefined
      if (output) return execZellij(`action dump-screen ${output}`)
      return execZellij("action dump-screen")
    }

    case "edit_scrollback":
      return execZellij("action edit-scrollback")

    case "rename": {
      const name = sanitize(params.name)
      if (!name) return "[ERROR] pane.rename requires params.name"
      return execZellij(`action rename-pane ${name}`)
    }

    case "undo_rename":
      return execZellij("action undo-rename-pane")

    case "swap": {
      const dir = sanitize(params.direction)
      if (!dir) return "[ERROR] pane.swap requires params.direction (left|right|up|down)"
      return execZellij(`action move-pane ${dir}`)
    }

    case "stack": {
      // Stack panes by moving them in sequence
      return execZellij("action toggle-pane-frames")
    }

    case "exec": {
      const command = sanitize(params.command)
      if (!command) return "[ERROR] pane.exec requires params.command"
      return execZellij(`run -- ${command}`)
    }

    case "write": {
      const text = String(params.text ?? "")
      if (!text) return "[ERROR] pane.write requires params.text"
      let cmd = `action write-chars "${text.replace(/"/g, '\\"')}"`
      if (params.submit) cmd += " && zellij action write 10" // newline
      return execZellij(cmd)
    }

    case "info":
      return execZellij("action dump-layout")

    case "move_focus_or_tab": {
      const dir = sanitize(params.direction)
      if (!dir) return "[ERROR] pane.move_focus_or_tab requires params.direction (left|right|up|down)"
      return execZellij(`action move-focus-or-tab ${dir}`)
    }

    case "change_coordinates": {
      // Requires x, y and optional width, height
      const x = params.x != null ? Number(params.x) : undefined
      const y = params.y != null ? Number(params.y) : undefined
      if (x == null || y == null) return "[ERROR] pane.change_coordinates requires params.x and params.y"
      let cmd = `action change-floating-pane-coordinates --x ${x} --y ${y}`
      if (params.width != null) cmd += ` --width ${Number(params.width)}`
      if (params.height != null) cmd += ` --height ${Number(params.height)}`
      return execZellij(cmd)
    }

    default:
      return `[ERROR] Unknown pane action: "${action}". Valid: new, close, focus, resize, scroll, scroll_to_edge, toggle_floating, toggle_fullscreen, toggle_embed_float, pin, toggle_frames, clear, dump_screen, edit_scrollback, rename, undo_rename, swap, stack, exec, write, info, move_focus_or_tab, change_coordinates`
  }
}
