import { execZellij, sanitize } from "../exec"
import type { Params } from "../types"

export async function handlePipe(action: string, params: Params): Promise<string> {
  switch (action) {
    case "send": {
      const payload = String(params.payload ?? "")
      if (!payload) return "[ERROR] pipe.send requires params.payload"
      let cmd = `action pipe --payload "${payload.replace(/"/g, '\\"')}"`
      if (params.pipe_name) cmd += ` --name ${sanitize(params.pipe_name)}`
      if (params.plugin_url) cmd += ` --plugin ${sanitize(params.plugin_url)}`
      if (params.args) cmd += ` --args "${sanitize(params.args)}"`
      return execZellij(cmd)
    }

    case "to_plugin": {
      const payload = String(params.payload ?? "")
      const pluginUrl = sanitize(params.plugin_url)
      if (!payload || !pluginUrl) return "[ERROR] pipe.to_plugin requires params.payload and params.plugin_url"
      let cmd = `action pipe --payload "${payload.replace(/"/g, '\\"')}" --plugin ${pluginUrl}`
      if (params.pipe_name) cmd += ` --name ${sanitize(params.pipe_name)}`
      return execZellij(cmd)
    }

    case "broadcast": {
      const payload = String(params.payload ?? "")
      const pipeName = sanitize(params.pipe_name)
      if (!payload || !pipeName) return "[ERROR] pipe.broadcast requires params.payload and params.pipe_name"
      return execZellij(`action pipe --payload "${payload.replace(/"/g, '\\"')}" --name ${pipeName}`)
    }

    case "action": {
      const payload = String(params.payload ?? "")
      if (!payload) return "[ERROR] pipe.action requires params.payload"
      let cmd = `action pipe --payload "${payload.replace(/"/g, '\\"')}"`
      if (params.pipe_name) cmd += ` --name ${sanitize(params.pipe_name)}`
      if (params.plugin_url) cmd += ` --plugin ${sanitize(params.plugin_url)}`
      if (params.floating) cmd += " --floating"
      if (params.in_place) cmd += " --in-place"
      if (params.cwd) cmd += ` --cwd ${sanitize(params.cwd)}`
      if (params.title) cmd += ` --title "${sanitize(params.title)}"`
      if (params.skip_cache) cmd += " --skip-plugin-cache"
      return execZellij(cmd)
    }

    case "with_response": {
      const payload = String(params.payload ?? "")
      if (!payload) return "[ERROR] pipe.with_response requires params.payload"
      let cmd = `action pipe --payload "${payload.replace(/"/g, '\\"')}"`
      if (params.pipe_name) cmd += ` --name ${sanitize(params.pipe_name)}`
      if (params.plugin_url) cmd += ` --plugin ${sanitize(params.plugin_url)}`
      return execZellij(cmd)
    }

    case "from_file": {
      const filePath = sanitize(params.file_path)
      if (!filePath) return "[ERROR] pipe.from_file requires params.file_path"
      const { readFileSync } = await import("node:fs")
      const content = readFileSync(filePath, "utf-8")
      let cmd = `action pipe --payload "${content.replace(/"/g, '\\"')}"`
      if (params.pipe_name) cmd += ` --name ${sanitize(params.pipe_name)}`
      if (params.plugin_url) cmd += ` --plugin ${sanitize(params.plugin_url)}`
      return execZellij(cmd)
    }

    default:
      return `[ERROR] Unknown pipe action: "${action}". Valid: send, to_plugin, broadcast, action, with_response, from_file`
  }
}
