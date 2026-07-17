import { execZellij, sanitize } from "../exec"
import type { Params } from "../types"

export async function handleLayout(action: string, params: Params): Promise<string> {
  switch (action) {
    case "dump": {
      if (params.output_path) {
        const output = sanitize(params.output_path)
        const layout = await execZellij("action dump-layout")
        const { writeFileSync } = await import("node:fs")
        writeFileSync(output, layout)
        return `Layout dumped to ${output}`
      }
      return execZellij("action dump-layout")
    }

    case "save": {
      const name = sanitize(params.layout_name)
      if (!name) return "[ERROR] layout.save requires params.layout_name"
      const layout = await execZellij("action dump-layout")
      const dir = sanitize(params.layouts_dir) || `${process.env.HOME}/.config/zellij/layouts`
      const { mkdirSync, writeFileSync } = await import("node:fs")
      mkdirSync(dir, { recursive: true })
      writeFileSync(`${dir}/${name}.kdl`, layout)
      return `Layout saved as ${dir}/${name}.kdl`
    }

    case "apply": {
      const name = sanitize(params.layout_name)
      if (!name) return "[ERROR] layout.apply requires params.layout_name"
      return execZellij(`--layout ${name}`)
    }

    case "list": {
      const { readdirSync } = await import("node:fs")
      const dir = sanitize(params.layouts_dir) || `${process.env.HOME}/.config/zellij/layouts`
      try {
        const files = readdirSync(dir).filter((f: string) => f.endsWith(".kdl"))
        return files.length ? files.join("\n") : "No layouts found"
      } catch {
        return `No layouts directory found at ${dir}`
      }
    }

    case "load": {
      const name = sanitize(params.layout_name)
      if (!name) return "[ERROR] layout.load requires params.layout_name"
      return execZellij(`--layout ${name}`)
    }

    case "new_tab_with": {
      const name = sanitize(params.layout_name)
      if (!name) return "[ERROR] layout.new_tab_with requires params.layout_name"
      let cmd = `action new-tab --layout ${name}`
      if (params.tab_name) cmd += ` --name "${sanitize(params.tab_name)}"`
      return execZellij(cmd)
    }

    case "validate": {
      const path = sanitize(params.layout_path)
      if (!path) return "[ERROR] layout.validate requires params.layout_path"
      try {
        const { readFileSync } = await import("node:fs")
        readFileSync(path, "utf-8")
        return `Layout file ${path} exists and is readable`
      } catch (e) {
        return `[ERROR] Cannot read layout file: ${e}`
      }
    }

    default:
      return `[ERROR] Unknown layout action: "${action}". Valid: dump, save, apply, list, load, new_tab_with, validate`
  }
}
