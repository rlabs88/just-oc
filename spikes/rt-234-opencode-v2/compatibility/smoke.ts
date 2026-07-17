import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const expectedVersion = "1.17.5"
const expectedAgents = [
  "cortex",
  "delivery-coordinator",
  "focused-builder",
  "recovery-operator",
  "validator",
] as const
const fixture = join(import.meta.dir, "fixture")
const isolated = await mkdtemp(join(tmpdir(), "rt-234-opencode-"))

try {
  const version = (await run(["opencode", "--version"], fixture)).trim()
  if (version !== expectedVersion) {
    throw new Error(`Expected OpenCode ${expectedVersion}, received ${version}`)
  }

  const output = await run(["opencode", "debug", "config"], isolated, {
    HOME: isolated,
    OPENCODE_CONFIG_DIR: join(fixture, ".opencode"),
    XDG_CONFIG_HOME: join(isolated, "config"),
    XDG_DATA_HOME: join(isolated, "data"),
    XDG_CACHE_HOME: join(isolated, "cache"),
    XDG_STATE_HOME: join(isolated, "state"),
  })
  const config = JSON.parse(output) as RuntimeConfig
  if (config.model !== "openai/gpt-5.6-luna") {
    throw new Error("OpenCode did not preserve the Luna default model")
  }
  const loadedAgents = Object.keys(config.agent ?? {}).sort()
  if (JSON.stringify(loadedAgents) !== JSON.stringify(expectedAgents)) {
    throw new Error(`OpenCode loaded an unexpected role set: ${loadedAgents.join(",")}`)
  }
  for (const agentId of expectedAgents) {
    if (config.agent?.[agentId]?.model !== "openai/gpt-5.6-luna") {
      throw new Error(`OpenCode did not preserve Luna for ${agentId}`)
    }
  }
  const cortex = config.agent?.cortex
  if (!cortex) throw new Error("OpenCode did not load the compiled Cortex role")
  const task = cortex.permission?.task
  if (!task || typeof task === "string" || task["focused-builder"] !== "allow") {
    throw new Error("OpenCode did not preserve compiled task routing")
  }
  process.stdout.write(
    "OpenCode 1.17.5 loaded Luna and 5 compiled roles with task routing.\n",
  )
} finally {
  await rm(isolated, { recursive: true, force: true })
}

async function run(
  command: string[],
  cwd: string,
  overrides: Record<string, string> = {},
): Promise<string> {
  const process = Bun.spawn(command, {
    cwd,
    env: { ...Bun.env, ...overrides },
    stdout: "pipe",
    stderr: "pipe",
  })
  const timeout = setTimeout(() => process.kill(), 20_000)
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ])
  clearTimeout(timeout)
  if (exitCode !== 0) throw new Error(stderr.trim() || `Command failed: ${command[0]}`)
  return stdout
}

type RuntimeConfig = {
  model?: string
  agent?: Record<string, {
    model?: string
    permission?: Record<string, string | Record<string, string>>
  }>
}
