import { exec } from "node:child_process"

const TIMEOUT_MS = 30_000
const MAX_BUFFER = 10 * 1024 * 1024 // 10 MB

/**
 * Sanitize a string for safe shell interpolation.
 * Strips characters that could allow injection.
 */
export function sanitize(value: unknown): string {
  return String(value ?? "").replace(/[;&|`$(){}[\]!#]/g, "")
}

/**
 * Execute a zellij CLI command and return stdout.
 */
export function execZellij(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(`zellij ${command}`, { timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`zellij command failed: ${error.message}\n${stderr}`.trim()))
        return
      }
      resolve(stdout.trim())
    })
  })
}
