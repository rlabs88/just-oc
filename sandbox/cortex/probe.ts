import { readdir, writeFile } from "node:fs/promises"

export interface CompatibilityManifest {
  compatibilityVersion: number
  stateSchema: number
  workspaceSchema: number
  openCodeVersion: string
  build: { createdAt: string; revision: string; source: string; workflowUrl?: string }
}

const imageManifestPath = "/etc/cortex-sandbox/compatibility.json"
const retainedManifestName = "cortex-sandbox-compatibility.json"

async function readManifest(path: string): Promise<CompatibilityManifest> {
  const value = await Bun.file(path).json().catch((error) => {
    throw new Error(`invalid compatibility manifest ${path}: ${String(error)}`)
  })
  for (const field of ["compatibilityVersion", "stateSchema", "workspaceSchema"] as const) {
    if (!Number.isInteger(value[field]) || value[field] < 1) {
      throw new Error(`invalid compatibility field ${field}`)
    }
  }
  if (typeof value.openCodeVersion !== "string" || !value.openCodeVersion) {
    throw new Error("invalid compatibility field openCodeVersion")
  }
  return value as CompatibilityManifest
}

async function hasEntries(path: string, ignored: string[] = []): Promise<boolean> {
  const entries = await readdir(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return []
    throw error
  })
  return entries.some((entry) => !ignored.includes(entry))
}

export async function validateRetainedCompatibility(input: {
  image: CompatibilityManifest
  retained?: CompatibilityManifest
  stateHasData: boolean
  workspaceHasData: boolean
}): Promise<void> {
  const { image, retained } = input
  if (!retained) {
    if (input.stateHasData || input.workspaceHasData) {
      throw new Error("retained state or workspace has no compatibility metadata")
    }
    return
  }
  if (retained.compatibilityVersion !== image.compatibilityVersion) {
    throw new Error("unsupported sandbox compatibility version")
  }
  if (retained.stateSchema !== image.stateSchema) {
    throw new Error("unsupported OpenCode state schema")
  }
  if (retained.workspaceSchema !== image.workspaceSchema) {
    throw new Error("unsupported workspace checkpoint schema")
  }
}

async function probeCompatibility(state: string, workspace: string, initialize: boolean) {
  const image = await readManifest(imageManifestPath)
  const retainedPath = `${state}/${retainedManifestName}`
  const retained = await Bun.file(retainedPath).exists()
    ? await readManifest(retainedPath)
    : undefined
  await validateRetainedCompatibility({
    image,
    retained,
    stateHasData: await hasEntries(state, [retainedManifestName]),
    workspaceHasData: await hasEntries(workspace),
  })
  if (initialize && !retained) {
    await writeFile(retainedPath, `${JSON.stringify(image, null, 2)}\n`, { mode: 0o600 })
  }
}

async function probePlugins() {
  const context = { client: {} }
  for (const bundle of ["background-tasks", "zellij", "command-run"]) {
    const plugin = (await import(`/opt/just-oc/plugins/${bundle}/index.ts`)).default
    const hooks = await plugin(context)
    if (!hooks?.tool) throw new Error(`${bundle} did not initialize tools`)
  }
  const archetypes = (await import("/opt/just-oc/plugins/agent-archetype-system/index.ts")).default
  const hooks = await archetypes(context)
  const config: Record<string, any> = {}
  await hooks.config(config)
  if (config.agent?.cortex?.mode !== "all") throw new Error("Cortex did not initialize")
}

async function probeImage() {
  const manifest = await readManifest(imageManifestPath)
  const result = Bun.spawnSync(["opencode", "--version"])
  if (result.exitCode !== 0) throw new Error("OpenCode CLI is unavailable")
  const version = new TextDecoder().decode(result.stdout).trim()
  if (!version.includes(manifest.openCodeVersion)) {
    throw new Error(`OpenCode version mismatch: expected ${manifest.openCodeVersion}, got ${version}`)
  }
}

if (import.meta.main) {
  const [command = "all", ...args] = Bun.argv.slice(2)
  const value = (name: string, fallback: string) => {
    const index = args.indexOf(name)
    return index >= 0 ? args[index + 1] : fallback
  }
  const state = value("--state", process.env.XDG_DATA_HOME || "/var/lib/opencode")
  const workspace = value("--workspace", process.env.OPENCODE_WORKSPACE || "/workspace")
  if (command === "compatibility" || command === "all") {
    await probeCompatibility(state, workspace, args.includes("--initialize"))
  }
  if (command === "plugins" || command === "all") await probePlugins()
  if (command === "image" || command === "all") await probeImage()
  console.log(`cortex sandbox probe passed: ${command}`)
}
