import { mkdir, writeFile } from "node:fs/promises"

const root = "/etc/cortex-sandbox"
const pluginDirectory = `${root}/config/opencode/plugins`
const bundles = [
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
await writeFile(
  `${root}/config/opencode/opencode.json`,
  `${JSON.stringify(projectConfig, null, 2)}\n`,
)

const compatibility = {
  compatibilityVersion: Number(process.env.COMPATIBILITY_VERSION || "1"),
  stateSchema: 1,
  workspaceSchema: 1,
  openCodeVersion: "1.17.5",
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
