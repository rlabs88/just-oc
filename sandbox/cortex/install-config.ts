import { mkdir, writeFile } from "node:fs/promises"

const root = "/etc/cortex-sandbox"
const pluginDirectory = `${root}/config/opencode/plugins`
// The image's own bundle set, distinct from the host installer's. `ae2e` belongs
// here because a provisioned sandbox is where an AE2E run actually executes, and
// the bundle is inert until a control-plane kickoff arrives — loading it costs a
// session that is not under the policy nothing.
const bundles = [
  "ae2e",
  "agent-archetype-system",
  "background-tasks",
  "command-run",
  "zellij",
]

await mkdir(pluginDirectory, { recursive: true })

for (const bundle of bundles) {
  await writeFile(
    `${pluginDirectory}/${bundle}.ts`,
    `export { default } from "/opt/just-oc/plugins/${bundle}/index.ts"\n`,
  )
}

const projectConfig = await Bun.file("/opt/just-oc/.opencode/opencode.json").json()
const toolchain = await Bun.file(`${root}/toolchain.lock.json`).json()
await writeFile(
  `${root}/config/opencode/opencode.json`,
  `${JSON.stringify(projectConfig, null, 2)}\n`,
)

const compatibility = {
  compatibilityVersion: Number(process.env.COMPATIBILITY_VERSION || toolchain.compatibilityVersion),
  stateSchema: toolchain.stateSchema,
  workspaceSchema: toolchain.workspaceSchema,
  provisioningSchema: toolchain.provisioningSchema,
  openCodeVersion: toolchain.npmPackages["opencode-ai"],
  baseline: toolchain,
  build: {
    createdAt: process.env.BUILD_CREATED || "unknown",
    revision: process.env.BUILD_REVISION || "unknown",
    source: process.env.BUILD_SOURCE || "https://github.com/rlabs88/just-oc",
    workflowUrl: process.env.BUILD_WORKFLOW_URL || "local",
  },
}

await writeFile(
  `${root}/compatibility.json`,
  `${JSON.stringify(compatibility, null, 2)}\n`,
)
