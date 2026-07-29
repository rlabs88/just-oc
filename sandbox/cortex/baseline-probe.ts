import { agentToolPackageJson } from "./agent-tools"

type Lock = {
  base: { distribution: string; version: string }
  formulae: Record<string, string>
  npmPackages: Record<string, string>
  mason: {
    registry: { revision: string; path: string }
    packages: Record<string, {
      version: string
      source: string
      artifact: string
      extraArtifacts?: string[]
      binaries: string[]
      adapter?: { kind: string; formula: string; sourceBinary: string }
    }>
  }
  capabilities: { flock: { providerVersion: string } }
}

const lock = await Bun.file("/etc/cortex-sandbox/toolchain.lock.json").json() as Lock
const machine = Bun.spawnSync(["uname", "-m"])
if (machine.exitCode !== 0 || new TextDecoder().decode(machine.stdout).trim() !== "aarch64") {
  throw new Error("sandbox machine architecture is not aarch64")
}
if (process.arch !== "arm64") throw new Error(`Bun architecture is ${process.arch}, expected arm64`)
const commands: Array<[string, string[], string]> = [
  ["git", ["--version"], lock.formulae.git], ["gh", ["--version"], lock.formulae.gh],
  ["git-lfs", ["version"], lock.formulae["git-lfs"]], ["rg", ["--version"], lock.formulae.ripgrep],
  ["fd", ["--version"], lock.formulae.fd], ["fzf", ["--version"], lock.formulae.fzf],
  ["jq", ["--version"], lock.formulae.jq], ["yq", ["--version"], lock.formulae.yq],
  ["curl", ["--version"], lock.formulae.curl], ["wget", ["--version"], lock.formulae.wget],
  ["tree", ["--version"], lock.formulae.tree], ["bat", ["--version"], lock.formulae.bat],
  ["eza", ["--version"], lock.formulae.eza], ["just", ["--version"], lock.formulae.just],
  ["lazygit", ["--version"], lock.formulae.lazygit], ["stow", ["--version"], lock.formulae.stow],
  ["zoxide", ["--version"], lock.formulae.zoxide], ["rclone", ["version"], lock.formulae.rclone],
  ["age", ["--version"], lock.formulae.age], ["sops", ["--version"], lock.formulae.sops],
  ["infisical", ["--version"], lock.formulae.infisical], ["direnv", ["version"], lock.formulae.direnv],
  ["nvim", ["--version"], lock.formulae.neovim], ["tmux", ["-V"], lock.formulae.tmux],
  ["zellij", ["--version"], lock.formulae.zellij], ["starship", ["--version"], lock.formulae.starship],
  ["tree-sitter", ["--version"], lock.formulae["tree-sitter"]], ["yazi", ["--version"], lock.formulae.yazi],
  ["node", ["--version"], lock.formulae.node], ["bun", ["--version"], lock.formulae.bun],
  ["python3.13", ["--version"], lock.formulae["python@3.13"]], ["uv", ["--version"], lock.formulae.uv],
  ["herdr", ["--version"], lock.formulae.herdr], ["flock", ["--version"], lock.capabilities.flock.providerVersion],
  ["tailscale", ["version"], lock.formulae.tailscale], ["ttyd", ["--version"], lock.formulae.ttyd],
]

for (const [command, args, expected] of commands) {
  const result = Bun.spawnSync([command, ...args], { env: process.env })
  const output = `${new TextDecoder().decode(result.stdout)}${new TextDecoder().decode(result.stderr)}`
  if (result.exitCode !== 0 || !output.includes(expected)) {
    throw new Error(`${command} version mismatch: expected ${expected}, got ${output.trim()}`)
  }
}

const npmTools: Array<[string, string, string]> = [
  ["claude", "@anthropic-ai/claude-code", "@anthropic-ai/claude-code"],
  ["codex", "@openai/codex", "@openai/codex"],
  ["codex-acp", "@zed-industries/codex-acp", "@zed-industries/codex-acp"],
  ["mastracode", "mastracode", "mastracode"],
  ["opencode", "opencode-ai", "opencode-ai"],
]
for (const [command, packageDirectory, lockName] of npmTools) {
  if (!Bun.which(command)) throw new Error(`missing agent CLI ${command}`)
  const packageJson = await Bun.file(agentToolPackageJson(packageDirectory)).json() as {
    version?: string
  }
  if (packageJson.version !== lock.npmPackages[lockName]) {
    throw new Error(`${command} package mismatch: expected ${lock.npmPackages[lockName]}, got ${packageJson.version}`)
  }
  const smokeArguments = command === "codex-acp" || command === "mastracode" ? ["--help"] : ["--version"]
  const smoke = Bun.spawnSync([command, ...smokeArguments], { env: process.env })
  if (smoke.exitCode !== 0) throw new Error(`${command} cannot execute on linux/arm64`)
}

if (Bun.which("zmx")) throw new Error("zmx must be absent from the headless baseline")
if (lock.base.distribution !== "fedora") throw new Error("baseline is not Fedora")

const registryRevision = Bun.spawnSync(
  ["git", "-C", lock.mason.registry.path, "rev-parse", "HEAD"],
  { env: process.env },
)
const actualRegistryRevision = new TextDecoder().decode(registryRevision.stdout).trim()
if (registryRevision.exitCode !== 0 || actualRegistryRevision !== lock.mason.registry.revision) {
  throw new Error(`Mason registry revision mismatch: expected ${lock.mason.registry.revision}, got ${actualRegistryRevision}`)
}
const registryStatus = Bun.spawnSync(
  ["git", "-C", lock.mason.registry.path, "status", "--porcelain"],
  { env: process.env },
)
if (registryStatus.exitCode !== 0 || new TextDecoder().decode(registryStatus.stdout) !== "") {
  throw new Error("baked Mason registry is not clean")
}

const masonVersionCommands: Record<string, [string, string[]]> = {
  pyright: ["pyright", ["--version"]],
  black: ["black", ["--version"]],
  ruff: ["ruff", ["--version"]],
  clangd: ["clangd", ["--version"]],
  "clang-format": ["clang-format", ["--version"]],
  cpplint: ["cpplint", ["--version"]],
  "typescript-language-server": ["typescript-language-server", ["--version"]],
  prettier: ["prettier", ["--version"]],
  eslint_d: ["eslint_d", ["--version"]],
}

for (const [name, mason] of Object.entries(lock.mason.packages)) {
  for (const binary of mason.binaries) {
    const path = `/home/cortex/.local/share/nvim/mason/bin/${binary}`
    if (!(await Bun.file(path).exists())) throw new Error(`missing offline Mason binary ${binary}`)
  }
  if (mason.adapter) {
    const provider = await Bun.file(
      `/home/cortex/.local/share/nvim/mason/packages/${name}/cortex-provider.json`,
    ).json() as { kind: string; formula: string; version: string; sourceBinary: string }
    if (provider.kind !== mason.adapter.kind
      || provider.formula !== mason.adapter.formula
      || provider.version !== mason.version
      || provider.sourceBinary !== mason.adapter.sourceBinary) {
      throw new Error(`architecture adapter mismatch for ${name}`)
    }
  } else {
    const receiptPath = `/home/cortex/.local/share/nvim/mason/packages/${name}/mason-receipt.json`
    const receipt = await Bun.file(receiptPath).json() as {
      name: string
      source: { id: string }
      registry: { proto: string; path: string }
    }
    if (receipt.name !== name || receipt.source.id !== mason.source) {
      throw new Error(`Mason receipt mismatch for ${name}: expected ${mason.source}, got ${receipt.source.id}`)
    }
    if (receipt.registry.proto !== "file" || receipt.registry.path !== lock.mason.registry.path) {
      throw new Error(`Mason registry receipt mismatch for ${name}`)
    }
  }
  const versionCommand = masonVersionCommands[name]
  if (!versionCommand) throw new Error(`missing Mason version probe for ${name}`)
  const [command, args] = versionCommand
  const result = Bun.spawnSync([command, ...args], { env: process.env })
  const output = `${new TextDecoder().decode(result.stdout)}${new TextDecoder().decode(result.stderr)}`
  if (result.exitCode !== 0 || !output.includes(mason.version)) {
    throw new Error(`${name} version mismatch: expected ${mason.version}, got ${output.trim()}`)
  }
}
console.log(`baseline probe passed: ${commands.length + npmTools.length} commands, ${Object.keys(lock.mason.packages).length} Mason packages`)
