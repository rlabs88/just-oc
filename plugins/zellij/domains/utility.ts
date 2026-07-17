import { execZellij, sanitize } from "../exec"
import type { Params } from "../types"

type PaneInfo = { type: string; name?: string; focused?: boolean; plugin?: string }
type TabInfo = { name: string; focused: boolean; panes: PaneInfo[] }

/**
 * Parse the actual tab/pane tree from a dump-layout KDL string.
 * Extracts only real tab blocks, skips swap layouts and templates.
 */
function parseLayout(kdl: string): TabInfo[] {
  const tabs: TabInfo[] = []
  const lines = kdl.split("\n")
  let inTab = false
  let inFloating = false
  let depth = 0
  let tabDepth = 0
  let currentTab: TabInfo | null = null

  for (let idx = 0; idx < lines.length; idx++) {
    const trimmed = lines[idx].trim()

    // Stop at swap layouts or new_tab_template — these are just templates, not real state
    if (trimmed.startsWith("swap_") || trimmed.startsWith("new_tab_template")) break

    // Detect tab blocks
    if (trimmed.startsWith("tab ") && !inTab) {
      const nameMatch = trimmed.match(/name="([^"]*)"/)
      currentTab = { name: nameMatch?.[1] ?? "unnamed", focused: trimmed.includes("focus=true"), panes: [] }
      tabs.push(currentTab)
      inTab = true
      tabDepth = depth
      inFloating = false
    }

    if (trimmed.startsWith("floating_panes")) inFloating = true

    // Detect panes inside tabs
    if (inTab && currentTab && trimmed.startsWith("pane")) {
      const nameMatch = trimmed.match(/name="([^"]*)"/)
      const focused = trimmed.includes("focus=true")
      const isBorderless = trimmed.includes("borderless=true")
      const hasSize1 = trimmed.includes("size=1")

      // A pane with a { body might contain a plugin
      let isPlugin = false
      let pluginName: string | undefined
      if (trimmed.includes("{")) {
        for (let i = idx + 1; i < lines.length; i++) {
          const next = lines[i].trim()
          if (!next) continue
          if (next.startsWith("plugin location=")) {
            isPlugin = true
            pluginName = next.match(/location="([^"]*)"/) ?.[1]
          }
          break
        }
      }

      // Filter: skip UI chrome (borderless size=1 plugins like tab-bar, status-bar)
      const isChrome = isPlugin && isBorderless && hasSize1
      if (!isChrome) {
        if (isPlugin) {
          currentTab.panes.push({ type: "plugin", name: nameMatch?.[1], focused: focused || undefined, plugin: pluginName })
        } else {
          currentTab.panes.push({ type: inFloating ? "floating" : "shell", name: nameMatch?.[1], focused: focused || undefined })
        }
      }
    }

    // Track brace depth to detect tab exit
    for (const ch of trimmed) {
      if (ch === "{") depth++
      if (ch === "}") {
        depth--
        if (inTab && depth <= tabDepth) {
          inTab = false
          inFloating = false
          currentTab = null
        }
      }
    }
  }

  return tabs
}

export async function handleUtility(action: string, params: Params): Promise<string> {
  switch (action) {
    case "run_command": {
      const command = sanitize(params.command)
      if (!command) return "[ERROR] utility.run_command requires params.command"
      let cmd = "run"
      if (params.direction) cmd += ` --direction ${sanitize(params.direction)}`
      cmd += ` -- ${command}`
      return execZellij(cmd)
    }

    case "edit_file": {
      const filePath = sanitize(params.file_path)
      if (!filePath) return "[ERROR] utility.edit_file requires params.file_path"
      return execZellij(`edit "${filePath}"`)
    }

    case "switch_mode": {
      const mode = sanitize(params.mode)
      if (!mode) return "[ERROR] utility.switch_mode requires params.mode (locked|pane|tab|resize|move|search|session)"
      return execZellij(`action switch-mode ${mode}`)
    }

    case "snapshot": {
      // One-call mega query: returns all sessions, tabs, and panes
      const sessionsRaw = await execZellij("list-sessions")
      const sessionLines = sessionsRaw.split("\n").filter(l => l.trim())

      const sessions: Array<{
        name: string
        info: string
        tabs: Array<{
          name: string
          focused: boolean
          panes: Array<{ type: string; name?: string; focused?: boolean; plugin?: string }>
        }>
      }> = []

      for (const line of sessionLines) {
        // Parse session name — first word, strip ANSI codes
        const clean = line.replace(/\x1b\[[0-9;]*m/g, "").trim()
        const name = clean.split(/\s/)[0]
        if (!name) continue

        let tabs: ReturnType<typeof parseLayout> = []
        try {
          const layout = await execZellij(`--session ${name} action dump-layout`)
          tabs = parseLayout(layout)
        } catch {
          // Session may not be attachable (exited, etc.)
        }

        sessions.push({ name, info: clean, tabs })
      }

      return JSON.stringify(sessions, null, 2)
    }

    case "health_check":
      return execZellij("--version")

    case "clear_cache":
      return "Cache cleared"

    case "cache_stats":
      return "No cache configured"

    default:
      return `[ERROR] Unknown utility action: "${action}". Valid: run_command, edit_file, switch_mode, health_check, snapshot, clear_cache, cache_stats`
  }
}
