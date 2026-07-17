import { execZellij, sanitize } from "../exec"
import type { Params } from "../types"

export async function handleDetection(action: string, params: Params): Promise<string> {
  switch (action) {
    case "watch_pipe": {
      const pipePath = sanitize(params.pipe_path)
      if (!pipePath) return "[ERROR] detection.watch_pipe requires params.pipe_path"
      const timeout = Number(params.timeout_ms) || 30000
      // Use tail to watch pipe with timeout
      return execZellij(`run -- timeout ${Math.ceil(timeout / 1000)} tail -f ${pipePath}`)
    }

    case "create_named_pipe": {
      const pipeName = sanitize(params.pipe_name)
      if (!pipeName) return "[ERROR] detection.create_named_pipe requires params.pipe_name"
      const mode = sanitize(params.mode) || "0666"
      const { execSync } = await import("node:child_process")
      const pipePath = `/tmp/zellij-pipe-${pipeName}`
      execSync(`mkfifo -m ${mode} ${pipePath} 2>/dev/null || true`)
      return `Named pipe created at ${pipePath}`
    }

    case "pipe_with_timeout": {
      const command = sanitize(params.command)
      const targetPipe = sanitize(params.target_pipe)
      if (!command || !targetPipe) return "[ERROR] detection.pipe_with_timeout requires params.command and params.target_pipe"
      const timeout = Number(params.timeout_ms) || 30000
      return execZellij(`run -- timeout ${Math.ceil(timeout / 1000)} sh -c '${command} > ${targetPipe}'`)
    }

    case "poll_process": {
      const pid = sanitize(params.pid)
      if (!pid) return "[ERROR] detection.poll_process requires params.pid"
      const { execSync } = await import("node:child_process")
      try {
        execSync(`kill -0 ${pid} 2>/dev/null`)
        return `Process ${pid} is running`
      } catch {
        return `Process ${pid} is not running`
      }
    }

    case "watch_file": {
      const filePath = sanitize(params.file_path)
      if (!filePath) return "[ERROR] detection.watch_file requires params.file_path"
      const { readFileSync } = await import("node:fs")
      try {
        const content = readFileSync(filePath, "utf-8")
        if (params.patterns) {
          const patterns = Array.isArray(params.patterns) ? params.patterns : [String(params.patterns)]
          const matches = patterns.filter((p: string) => content.includes(p))
          return matches.length
            ? `File matches patterns: ${matches.join(", ")}\n\nContent:\n${content}`
            : `No pattern matches found in ${filePath}`
        }
        return content
      } catch (e) {
        return `[ERROR] Cannot read file: ${e}`
      }
    }

    case "create_llm_wrapper": {
      const wrapperName = sanitize(params.wrapper_name)
      const llmCommand = sanitize(params.llm_command)
      if (!wrapperName || !llmCommand) return "[ERROR] detection.create_llm_wrapper requires params.wrapper_name and params.llm_command"
      const marker = sanitize(params.detect_marker) || "<<<LLM_COMPLETE>>>"
      const timeout = Number(params.timeout_ms) || 60000
      const wrapperPath = `/tmp/zellij-wrapper-${wrapperName}.sh`
      const { writeFileSync, chmodSync } = await import("node:fs")
      const script = `#!/bin/bash\n${llmCommand}\necho "${marker}"\n`
      writeFileSync(wrapperPath, script)
      chmodSync(wrapperPath, "755")
      return `LLM wrapper created at ${wrapperPath} (timeout: ${timeout}ms, marker: ${marker})`
    }

    case "cleanup": {
      const { execSync } = await import("node:child_process")
      execSync("rm -f /tmp/zellij-pipe-* /tmp/zellij-wrapper-* 2>/dev/null || true")
      return "Detection artifacts cleaned up"
    }

    default:
      return `[ERROR] Unknown detection action: "${action}". Valid: watch_pipe, create_named_pipe, pipe_with_timeout, poll_process, watch_file, create_llm_wrapper, cleanup`
  }
}
