import { execZellij, sanitize } from "../exec"
import type { Params } from "../types"
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, watch } from "node:fs"
import { execSync } from "node:child_process"
import { randomBytes } from "node:crypto"

const DEFAULT_TIMEOUT_MS = 30_000
const BRIDGE_BASE = "/tmp/zellij-bridge"

function bridgeDir(session: string): string {
  return `${BRIDGE_BASE}-${session}`
}

function resolveSession(params: Params): string {
  return sanitize(params.session) || "default"
}

async function navigateToTarget(params: Params): Promise<void> {
  if (params.session) {
    await execZellij(`action switch-session ${sanitize(params.session)}`)
  }
  if (params.tab) {
    const tab = String(params.tab)
    const isIndex = /^\d+$/.test(tab)
    if (isIndex) {
      await execZellij(`action go-to-tab ${tab}`)
    } else {
      await execZellij(`action go-to-tab-name "${sanitize(tab)}"`)
    }
  }
  if (params.pane) {
    await execZellij(`action move-focus ${sanitize(params.pane)}`)
  }
}

function waitForResult(resultDir: string, requestId: string, timeoutMs: number): Promise<string> {
  const resultPath = `${resultDir}/${requestId}.json`

  // Race condition guard: result may already exist
  if (existsSync(resultPath)) {
    const content = readFileSync(resultPath, "utf-8")
    unlinkSync(resultPath)
    return Promise.resolve(content)
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      watcher.close()
      reject(new Error(`Command timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    const watcher = watch(resultDir, (_, filename) => {
      if (filename === `${requestId}.json`) {
        watcher.close()
        clearTimeout(timer)
        // Small delay to ensure the rename is fully visible
        setTimeout(() => {
          try {
            const content = readFileSync(resultPath, "utf-8")
            unlinkSync(resultPath)
            resolve(content)
          } catch (e) {
            reject(new Error(`Failed to read result: ${e}`))
          }
        }, 10)
      }
    })
  })
}

const LISTENER_SCRIPT = `#!/usr/bin/env bash
BRIDGE_DIR="$1"
CMD_PIPE="\${BRIDGE_DIR}/cmd.pipe"
RESULT_DIR="\${BRIDGE_DIR}/results"

echo "$$" > "\${BRIDGE_DIR}/listener.pid"
echo "[shell-bridge] Listener active (pid $$)"
echo "[shell-bridge] Pipe: \${CMD_PIPE}"

# Open FIFO read-write to prevent EOF when writers disconnect
exec 3<> "\$CMD_PIPE"

while IFS= read -r request <&3; do
  [ -z "\$request" ] && continue

  request_id=\$(echo "\$request" | jq -r '.request_id // empty')
  command=\$(echo "\$request" | jq -r '.command // empty')

  [ -z "\$request_id" ] || [ -z "\$command" ] && continue
  [ "\$command" = "__shutdown__" ] && break

  echo -e "\\n[bridge:\${request_id}] \\$ \${command}\\n---"

  start_ns=\$(date +%s%N)
  stdout_f=\$(mktemp); stderr_f=\$(mktemp)

  set +e
  # Override exit builtin to prevent terminating the listener
  exit() { return "\${1:-0}"; }
  eval "\$command" >"\$stdout_f" 2>"\$stderr_f"
  ec=\$?
  unset -f exit 2>/dev/null
  set -e

  end_ns=\$(date +%s%N)
  duration_ms=\$(( (end_ns - start_ns) / 1000000 ))

  out=\$(cat "\$stdout_f"); err=\$(cat "\$stderr_f")
  rm -f "\$stdout_f" "\$stderr_f"

  [ -n "\$out" ] && echo "\$out"
  [ -n "\$err" ] && echo "[stderr] \$err" >&2
  echo "--- exit:\${ec} (\${duration_ms}ms)"

  tmp=\$(mktemp "\${RESULT_DIR}/.tmp.XXXXXX")
  jq -n --arg rid "\$request_id" --arg out "\$out" --arg err "\$err" \\
    --argjson ec "\$ec" --arg cwd "\$(pwd)" --argjson dur "\$duration_ms" \\
    '{request_id:\$rid, stdout:\$out, stderr:\$err, exit_code:\$ec, cwd:\$cwd, duration_ms:\$dur}' \\
    > "\$tmp"
  mv "\$tmp" "\${RESULT_DIR}/\${request_id}.json"
done

exec 3<&-
echo "[shell-bridge] Stopped"
`

export async function handleExec(action: string, params: Params): Promise<string> {
  switch (action) {
    case "start": {
      // Check jq availability
      try {
        execSync("which jq", { stdio: "pipe" })
      } catch {
        return "[ERROR] exec.start requires 'jq' to be installed. Install it with: apt install jq"
      }

      const session = resolveSession(params)
      const dir = bridgeDir(session)
      const resultDir = `${dir}/results`
      const pipePath = `${dir}/cmd.pipe`
      const scriptPath = `${dir}/listener.sh`

      // Check if bridge already exists and is alive
      if (existsSync(`${dir}/listener.pid`)) {
        try {
          const pid = readFileSync(`${dir}/listener.pid`, "utf-8").trim()
          execSync(`kill -0 ${pid} 2>/dev/null`, { stdio: "pipe" })
          return `Bridge already running for session "${session}" (pid ${pid}, dir: ${dir})`
        } catch {
          // Stale bridge — clean up and recreate
          execSync(`rm -rf ${dir}`)
        }
      }

      // Create bridge directory structure
      mkdirSync(resultDir, { recursive: true })

      // Create named pipe
      execSync(`mkfifo ${pipePath}`)

      // Write listener script
      writeFileSync(scriptPath, LISTENER_SCRIPT, { mode: 0o755 })

      // Navigate to target pane
      await navigateToTarget(params)

      // Launch listener
      const direction = sanitize(params.direction)
      if (direction) {
        // New pane mode
        let cmd = `action new-pane --direction ${direction}`
        if (params.cwd) cmd += ` --cwd ${sanitize(params.cwd)}`
        cmd += ` -- bash ${scriptPath} ${dir}`
        await execZellij(cmd)
      } else {
        // Existing pane mode — inject via write-chars
        const launchCmd = `bash ${scriptPath} ${dir}`
        await execZellij(`action write-chars "${launchCmd}"`)
        await execZellij("action write 10") // send Enter
      }

      // Wait for PID file to appear
      const deadline = Date.now() + 3000
      while (!existsSync(`${dir}/listener.pid`) && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 100))
      }

      if (!existsSync(`${dir}/listener.pid`)) {
        return `[ERROR] Bridge listener failed to start (no PID file after 3s). Dir: ${dir}`
      }

      const pid = readFileSync(`${dir}/listener.pid`, "utf-8").trim()
      return `Bridge started for session "${session}" (pid ${pid}, dir: ${dir})`
    }

    case "run": {
      const command = String(params.command ?? "")
      if (!command) return "[ERROR] exec.run requires params.command"

      const session = resolveSession(params)
      const dir = bridgeDir(session)
      const pipePath = `${dir}/cmd.pipe`
      const resultDir = `${dir}/results`

      // Verify bridge is alive
      if (!existsSync(`${dir}/listener.pid`)) {
        return `[ERROR] No bridge running for session "${session}". Call exec.start first.`
      }

      try {
        const pid = readFileSync(`${dir}/listener.pid`, "utf-8").trim()
        execSync(`kill -0 ${pid} 2>/dev/null`, { stdio: "pipe" })
      } catch {
        return `[ERROR] Bridge listener is dead for session "${session}". Call exec.start to restart.`
      }

      const timeoutMs = Number(params.timeout_ms) || DEFAULT_TIMEOUT_MS
      const requestId = `${Date.now()}-${randomBytes(4).toString("hex")}`

      // Write command to named pipe
      const request = JSON.stringify({ request_id: requestId, command }) + "\n"
      writeFileSync(pipePath, request)

      // Wait for result
      try {
        const result = await waitForResult(resultDir, requestId, timeoutMs)
        return result
      } catch (e) {
        return `[ERROR] ${e instanceof Error ? e.message : String(e)}`
      }
    }

    case "status": {
      const session = resolveSession(params)
      const dir = bridgeDir(session)

      if (!existsSync(dir)) {
        return `No bridge found for session "${session}"`
      }

      if (!existsSync(`${dir}/listener.pid`)) {
        return `Bridge directory exists but no PID file for session "${session}"`
      }

      const pid = readFileSync(`${dir}/listener.pid`, "utf-8").trim()
      try {
        execSync(`kill -0 ${pid} 2>/dev/null`, { stdio: "pipe" })
        return `Bridge alive for session "${session}" (pid ${pid}, dir: ${dir})`
      } catch {
        return `Bridge dead for session "${session}" (stale pid ${pid})`
      }
    }

    case "stop": {
      const session = resolveSession(params)
      const dir = bridgeDir(session)
      const pipePath = `${dir}/cmd.pipe`

      if (!existsSync(dir)) {
        return `No bridge found for session "${session}"`
      }

      // Send shutdown command
      if (existsSync(pipePath)) {
        try {
          const shutdownCmd = JSON.stringify({ request_id: "shutdown", command: "__shutdown__" }) + "\n"
          writeFileSync(pipePath, shutdownCmd)
        } catch {
          // Pipe may be broken, proceed to force kill
        }
      }

      // Wait briefly for graceful exit, then force kill
      if (existsSync(`${dir}/listener.pid`)) {
        const pid = readFileSync(`${dir}/listener.pid`, "utf-8").trim()
        await new Promise(r => setTimeout(r, 500))
        try {
          execSync(`kill -0 ${pid} 2>/dev/null`, { stdio: "pipe" })
          // Still alive — force kill
          execSync(`kill ${pid} 2>/dev/null`, { stdio: "pipe" })
        } catch {
          // Already dead
        }
      }

      // Clean up
      execSync(`rm -rf ${dir}`)
      return `Bridge stopped and cleaned up for session "${session}"`
    }

    default:
      return `[ERROR] Unknown exec action: "${action}". Valid: start, run, status, stop`
  }
}
