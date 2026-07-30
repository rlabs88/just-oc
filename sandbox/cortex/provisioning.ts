import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm } from "node:fs/promises"
import { isAbsolute, join, resolve } from "node:path"

export interface ProvisioningRepository {
  id: string
  origin: string
  ref: string
}

export interface ProvisioningDescriptor {
  schemaVersion: 1
  primaryRepositoryId: string
  repositories: ProvisioningRepository[]
  layout: "repos"
  profileId?: string
}

export interface ProvisioningResult {
  primaryDirectory: string
  repositoryDirectories: Record<string, string>
  profileId?: string
}

export interface ProvisioningRequest {
  provisioningFile: string
  workspaceDirectory?: string
  environment?: Record<string, string | undefined>
}

interface GitResult {
  exitCode: number
  stdout: string
}

const descriptorFields = new Set([
  "schemaVersion",
  "primaryRepositoryId",
  "repositories",
  "layout",
  "profileId",
])
const repositoryFields = new Set(["id", "origin", "ref"])
const safeRepositoryId = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const urlScheme = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//
const scpStyleOrigin = /^[^/\\:]+@[^/\\:]+:/

function record(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${name} must be an object`)
  }
  return value as Record<string, unknown>
}

function rejectUnknownFields(value: Record<string, unknown>, allowed: Set<string>, name: string): void {
  const unknown = Object.keys(value).find((field) => !allowed.has(field))
  if (unknown) throw new Error(`unknown ${name} field`)
}

function requiredString(value: Record<string, unknown>, field: string): string {
  if (!Object.hasOwn(value, field) || typeof value[field] !== "string" || value[field].length === 0) {
    throw new Error(`${field} must be a non-empty string`)
  }
  return value[field]
}

function validateRepositoryId(id: string): void {
  if (!safeRepositoryId.test(id) || id.endsWith(".")) {
    throw new Error("unsafe repository id")
  }
}

function validateOrigin(origin: string): void {
  if (origin.startsWith("-") || /[\0\r\n]/.test(origin)) {
    throw new Error("invalid repository origin")
  }
  if (scpStyleOrigin.test(origin)) {
    throw new Error("credential-bearing repository origin")
  }
  if (!urlScheme.test(origin)) return
  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    throw new Error("invalid repository origin")
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("credential-bearing repository origin")
  }
}

function validateRef(ref: string): void {
  const components = ref.split("/")
  const unsafe = ref.startsWith("-")
    || ref.startsWith("/")
    || ref.endsWith("/")
    || ref.endsWith(".")
    || ref === "@"
    || ref.includes("..")
    || ref.includes("@{")
    || ref.includes("//")
    || /[\0-\x20\x7f~^:?*\[\\]/.test(ref)
    || components.some((component) => component.startsWith(".") || component.endsWith(".lock"))
  if (unsafe) throw new Error("invalid repository ref")
}

function parseRepository(value: unknown): ProvisioningRepository {
  const repository = record(value, "repository")
  rejectUnknownFields(repository, repositoryFields, "repository")
  const id = requiredString(repository, "id")
  const origin = requiredString(repository, "origin")
  const ref = requiredString(repository, "ref")
  validateRepositoryId(id)
  validateOrigin(origin)
  validateRef(ref)
  return { id, origin, ref }
}

export function parseProvisioningDescriptor(value: unknown): ProvisioningDescriptor {
  const descriptor = record(value, "provisioning descriptor")
  rejectUnknownFields(descriptor, descriptorFields, "descriptor")
  if (descriptor.schemaVersion !== 1) throw new Error("unsupported schemaVersion")
  if (descriptor.layout !== "repos") throw new Error("unsupported repository layout")
  const primaryRepositoryId = requiredString(descriptor, "primaryRepositoryId")
  validateRepositoryId(primaryRepositoryId)
  if (!Array.isArray(descriptor.repositories) || descriptor.repositories.length === 0) {
    throw new Error("repositories must be a non-empty array")
  }
  const repositories = descriptor.repositories.map(parseRepository)
  const ids = new Set<string>()
  for (const repository of repositories) {
    if (ids.has(repository.id)) throw new Error("duplicate repository id")
    ids.add(repository.id)
  }
  if (!ids.has(primaryRepositoryId)) throw new Error("primaryRepositoryId is not present")
  if (Object.hasOwn(descriptor, "profileId") && typeof descriptor.profileId !== "string") {
    throw new Error("profileId must be a string")
  }
  return {
    schemaVersion: 1,
    primaryRepositoryId,
    repositories,
    layout: "repos",
    ...(typeof descriptor.profileId === "string" ? { profileId: descriptor.profileId } : {}),
  }
}

class Git {
  readonly environment: Record<string, string | undefined>

  constructor(environment: Record<string, string | undefined> = process.env) {
    this.environment = {
      ...environment,
      GCM_INTERACTIVE: "Never",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_TERMINAL_PROMPT: "0",
    }
  }

  async run(arguments_: string[], cwd?: string): Promise<GitResult> {
    const child = Bun.spawn(["git", "-c", "credential.helper=", ...arguments_], {
      cwd,
      env: this.environment,
      stderr: "pipe",
      stdout: "pipe",
    })
    const [exitCode, stdout] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])
    return { exitCode, stdout: stdout.trim() }
  }

  async require(arguments_: string[], repositoryId: string, cwd?: string): Promise<string> {
    const result = await this.run(arguments_, cwd)
    if (result.exitCode !== 0) throw new Error(`repository ${repositoryId}: Git operation failed`)
    return result.stdout
  }
}

async function directoryState(path: string): Promise<"absent" | "directory" | "unsafe"> {
  try {
    const state = await lstat(path)
    return state.isDirectory() && !state.isSymbolicLink() ? "directory" : "unsafe"
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "absent"
    throw error
  }
}

async function validateWorkspace(workspaceDirectory: string): Promise<string> {
  if (!isAbsolute(workspaceDirectory)) throw new Error("workspace directory must be absolute")
  const workspace = resolve(workspaceDirectory)
  await mkdir(workspace, { recursive: true })
  if (await directoryState(workspace) !== "directory") throw new Error("unsafe workspace directory")
  return workspace
}

async function validateExistingSet(repositoriesDirectory: string, requestedIds: Set<string>): Promise<boolean> {
  const state = await directoryState(repositoriesDirectory)
  if (state === "absent") return false
  if (state === "unsafe") throw new Error("unsafe repositories directory")
  const unexpected = (await readdir(repositoriesDirectory)).find((entry) => !requestedIds.has(entry))
  if (unexpected) throw new Error("existing repository set contains unrequested entries")
  return true
}

async function validateExistingRepository(
  git: Git,
  repository: ProvisioningRepository,
  directory: string,
): Promise<string> {
  if (await directoryState(directory) !== "directory") {
    throw new Error(`repository ${repository.id}: unsafe repository path`)
  }
  const isWorkTree = await git.require(["rev-parse", "--is-inside-work-tree"], repository.id, directory)
  if (isWorkTree !== "true") throw new Error(`repository ${repository.id}: not a Git worktree`)
  const origin = await git.require(["remote", "get-url", "origin"], repository.id, directory)
  if (origin !== repository.origin) throw new Error(`repository ${repository.id}: origin mismatch`)
  const status = await git.require(["status", "--porcelain=v1", "--untracked-files=all"], repository.id, directory)
  if (status) throw new Error(`repository ${repository.id}: worktree is not clean`)
  return git.require(["rev-parse", "--verify", "HEAD^{commit}"], repository.id, directory)
}

async function prepareRepository(
  git: Git,
  repository: ProvisioningRepository,
  admittedDirectory: string,
  stagedDirectory: string,
): Promise<boolean> {
  const existing = await directoryState(admittedDirectory) !== "absent"
  let admittedHead: string | undefined
  if (existing) {
    admittedHead = await validateExistingRepository(git, repository, admittedDirectory)
    await cp(admittedDirectory, stagedDirectory, {
      preserveTimestamps: true,
      recursive: true,
      verbatimSymlinks: true,
    })
  } else {
    await git.require([
      "clone",
      "--no-checkout",
      "--no-tags",
      "--origin",
      "origin",
      "--",
      repository.origin,
      stagedDirectory,
    ], repository.id)
  }
  await git.require(["fetch", "--force", "--tags", "--prune", "origin", repository.ref], repository.id, stagedDirectory)
  const requestedHead = await git.require(["rev-parse", "--verify", "FETCH_HEAD^{commit}"], repository.id, stagedDirectory)
  if (admittedHead && admittedHead !== requestedHead) {
    const ancestry = await git.run(["merge-base", "--is-ancestor", admittedHead, requestedHead], stagedDirectory)
    if (ancestry.exitCode === 1) throw new Error(`repository ${repository.id}: local history diverges from requested ref`)
    if (ancestry.exitCode !== 0) throw new Error(`repository ${repository.id}: Git operation failed`)
  }
  await git.require(["checkout", "--detach", "--force", requestedHead], repository.id, stagedDirectory)
  const stagedOrigin = await git.require(["remote", "get-url", "origin"], repository.id, stagedDirectory)
  if (stagedOrigin !== repository.origin) throw new Error(`repository ${repository.id}: origin mismatch`)
  return admittedHead !== requestedHead
}

async function publishRepositorySet(
  stagedSet: string,
  repositoriesDirectory: string,
  stagingDirectory: string,
  hasExistingSet: boolean,
): Promise<void> {
  if (!hasExistingSet) {
    await rename(stagedSet, repositoriesDirectory)
    return
  }
  const previousSet = join(stagingDirectory, "previous")
  await rename(repositoriesDirectory, previousSet)
  try {
    await rename(stagedSet, repositoriesDirectory)
  } catch {
    try {
      await rename(previousSet, repositoriesDirectory)
    } catch {
      throw new Error("failed to publish repository set and restore previous admission")
    }
    throw new Error("failed to publish repository set")
  }
}

function resultFor(descriptor: ProvisioningDescriptor, workspace: string): ProvisioningResult {
  const repositoryDirectories = Object.fromEntries(
    descriptor.repositories.map((repository) => [repository.id, join(workspace, descriptor.layout, repository.id)]),
  )
  return {
    primaryDirectory: repositoryDirectories[descriptor.primaryRepositoryId],
    repositoryDirectories,
    ...(descriptor.profileId === undefined ? {} : { profileId: descriptor.profileId }),
  }
}

async function provisionRepositories(
  descriptor: ProvisioningDescriptor,
  workspaceDirectory = "/workspace",
  environment: Record<string, string | undefined> = process.env,
): Promise<ProvisioningResult> {
  const workspace = await validateWorkspace(workspaceDirectory)
  const repositoriesDirectory = join(workspace, descriptor.layout)
  const requestedIds = new Set(descriptor.repositories.map((repository) => repository.id))
  const hasExistingSet = await validateExistingSet(repositoriesDirectory, requestedIds)
  const stagingDirectory = await mkdtemp(join(workspace, ".provisioning-"))
  const stagedSet = join(stagingDirectory, descriptor.layout)
  await mkdir(stagedSet)
  const git = new Git(environment)
  let changed = !hasExistingSet
  try {
    for (const repository of descriptor.repositories) {
      const admittedDirectory = join(repositoriesDirectory, repository.id)
      const stagedDirectory = join(stagedSet, repository.id)
      changed = await prepareRepository(git, repository, admittedDirectory, stagedDirectory) || changed
    }
    if (changed) {
      await publishRepositorySet(stagedSet, repositoriesDirectory, stagingDirectory, hasExistingSet)
    }
    return resultFor(descriptor, workspace)
  } finally {
    await rm(stagingDirectory, { force: true, recursive: true }).catch(() => undefined)
  }
}

export async function provisionFromFile(request: ProvisioningRequest): Promise<ProvisioningResult> {
  let value: unknown
  try {
    value = JSON.parse(await readFile(request.provisioningFile, "utf8"))
  } catch {
    throw new Error("invalid provisioning descriptor JSON")
  }
  const descriptor = parseProvisioningDescriptor(value)
  return provisionRepositories(descriptor, request.workspaceDirectory, request.environment)
}

function cliValue(arguments_: string[], name: string, required: boolean): string | undefined {
  const index = arguments_.indexOf(name)
  if (index === -1) {
    if (required) throw new Error(`missing ${name}`)
    return undefined
  }
  const value = arguments_[index + 1]
  if (!value || value.startsWith("--")) throw new Error(`missing ${name} value`)
  return value
}

export async function runProvisioningCli(arguments_: string[] = Bun.argv.slice(2)): Promise<ProvisioningResult> {
  const allowed = new Set(["--provisioning-file", "--workspace"])
  for (let index = 0; index < arguments_.length; index += 2) {
    if (!allowed.has(arguments_[index] ?? "")) throw new Error("unknown provisioning argument")
  }
  const provisioningFile = cliValue(arguments_, "--provisioning-file", true)!
  const workspaceDirectory = cliValue(arguments_, "--workspace", false)
  return provisionFromFile({ provisioningFile, workspaceDirectory })
}

if (import.meta.main) {
  try {
    console.log(JSON.stringify(await runProvisioningCli()))
  } catch (error) {
    const message = error instanceof Error ? error.message : "provisioning failed"
    console.error(JSON.stringify({ error: message }))
    process.exit(78)
  }
}
