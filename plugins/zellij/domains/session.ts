import { execZellij, sanitize } from "../exec"
import type { Params } from "../types"

export async function handleSession(action: string, params: Params): Promise<string> {
  switch (action) {
    case "list":
      return execZellij("list-sessions")

    case "new": {
      const name = sanitize(params.name)
      if (!name) return "[ERROR] session.new requires params.name"
      let cmd = `--session ${name}`
      if (params.layout) cmd += ` --layout ${sanitize(params.layout)}`
      return execZellij(cmd)
    }

    case "attach": {
      const name = sanitize(params.session_name)
      if (!name) return "[ERROR] session.attach requires params.session_name"
      return execZellij(`attach ${name}`)
    }

    case "kill": {
      const name = sanitize(params.session_name)
      if (!name) return "[ERROR] session.kill requires params.session_name"
      return execZellij(`kill-session ${name}`)
    }

    case "delete": {
      const name = sanitize(params.session_name)
      if (!name) return "[ERROR] session.delete requires params.session_name"
      return execZellij(`delete-session ${name}`)
    }

    case "rename": {
      const oldName = sanitize(params.old_name)
      const newName = sanitize(params.new_name)
      if (!oldName || !newName) return "[ERROR] session.rename requires params.old_name and params.new_name"
      // Attach to session then rename
      return execZellij(`--session ${oldName} action rename-session ${newName}`)
    }

    case "switch": {
      const name = sanitize(params.session_name)
      if (!name) return "[ERROR] session.switch requires params.session_name"
      return execZellij(`action switch-session ${name}`)
    }

    case "info": {
      const name = sanitize(params.session_name)
      if (!name) return "[ERROR] session.info requires params.session_name"
      return execZellij(`--session ${name} action dump-layout`)
    }

    case "clone": {
      const source = sanitize(params.source_session)
      const newName = sanitize(params.new_session_name)
      if (!source || !newName) return "[ERROR] session.clone requires params.source_session and params.new_session_name"
      // Export then import as new name
      const layout = await execZellij(`--session ${source} action dump-layout`)
      // Write layout to temp, import as new session
      return execZellij(`--session ${newName} --layout /dev/stdin <<< '${layout.replace(/'/g, "'\\''")}'`)
    }

    case "export": {
      const name = sanitize(params.session_name)
      if (!name) return "[ERROR] session.export requires params.session_name"
      const output = params.output_path ? sanitize(params.output_path) : undefined
      const layout = await execZellij(`--session ${name} action dump-layout`)
      if (output) {
        const { writeFileSync } = await import("node:fs")
        writeFileSync(output, layout)
        return `Session layout exported to ${output}`
      }
      return layout
    }

    case "import": {
      const path = sanitize(params.import_path)
      if (!path) return "[ERROR] session.import requires params.import_path"
      let cmd = `--layout ${path}`
      if (params.new_session_name) cmd += ` --session ${sanitize(params.new_session_name)}`
      return execZellij(cmd)
    }

    case "kill_all":
      return execZellij("kill-all-sessions --yes")

    case "delete_all":
      return execZellij("delete-all-sessions --yes")

    default:
      return `[ERROR] Unknown session action: "${action}". Valid: list, new, attach, kill, delete, rename, switch, info, clone, export, import, kill_all, delete_all`
  }
}
