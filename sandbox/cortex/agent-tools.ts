export const AGENT_TOOLS_INSTALL_ROOT = "/opt/agent-tools/node_modules"

export function agentToolPackageJson(packageDirectory: string): string {
  if (!packageDirectory || packageDirectory.startsWith("/") || packageDirectory.includes("..")) {
    throw new Error(`invalid agent tool package directory: ${packageDirectory}`)
  }
  return `${AGENT_TOOLS_INSTALL_ROOT}/${packageDirectory}/package.json`
}
