import { execZellij, sanitize } from "../exec"
import type { Params } from "../types"

export async function handlePlugin(action: string, params: Params): Promise<string> {
  switch (action) {
    case "launch": {
      const url = sanitize(params.plugin_url)
      if (!url) return "[ERROR] plugin.launch requires params.plugin_url"
      let cmd = `action launch-plugin ${url}`
      if (params.floating) cmd += " --floating"
      if (params.in_place) cmd += " --in-place"
      if (params.skip_cache) cmd += " --skip-plugin-cache"
      if (params.width) cmd += ` --width ${sanitize(params.width)}`
      if (params.height) cmd += ` --height ${sanitize(params.height)}`
      if (params.x) cmd += ` --x ${sanitize(params.x)}`
      if (params.y) cmd += ` --y ${sanitize(params.y)}`
      return execZellij(cmd)
    }

    case "action_launch": {
      const url = sanitize(params.plugin_url)
      if (!url) return "[ERROR] plugin.action_launch requires params.plugin_url"
      let cmd = `action launch-plugin ${url}`
      if (params.floating) cmd += " --floating"
      if (params.in_place) cmd += " --in-place"
      if (params.skip_cache) cmd += " --skip-plugin-cache"
      return execZellij(cmd)
    }

    case "launch_or_focus": {
      const url = sanitize(params.plugin_url)
      if (!url) return "[ERROR] plugin.launch_or_focus requires params.plugin_url"
      let cmd = `action launch-or-focus-plugin ${url}`
      if (params.floating) cmd += " --floating"
      return execZellij(cmd)
    }

    case "start_or_reload": {
      const url = sanitize(params.plugin_url)
      if (!url) return "[ERROR] plugin.start_or_reload requires params.plugin_url"
      return execZellij(`action start-or-reload-plugin ${url}`)
    }

    case "list_aliases":
      return execZellij("action list-aliases")

    case "info": {
      const url = sanitize(params.plugin_url)
      if (!url) return "[ERROR] plugin.info requires params.plugin_url"
      return execZellij(`action list-plugins`)
    }

    case "list_running":
      return execZellij("action list-plugins")

    default:
      return `[ERROR] Unknown plugin action: "${action}". Valid: launch, action_launch, launch_or_focus, start_or_reload, list_aliases, info, list_running`
  }
}
