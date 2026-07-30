import { afterEach, describe, expect, test } from "bun:test"
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  parseProvisioningDescriptor,
  provisionFromFile,
  type ProvisioningDescriptor,
} from "./provisioning"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })))
})

function runGit(arguments_: string[], cwd?: string, environment?: Record<string, string>): string {
  const result = Bun.spawnSync(["git", ...arguments_], {
    cwd,
    env: { ...process.env, ...environment },
    stderr: "pipe",
    stdout: "pipe",
  })
  if (result.exitCode !== 0) {
    throw new Error(new TextDecoder().decode(result.stderr))
  }
  return new TextDecoder().decode(result.stdout).trim()
}

class RepositoryFixture {
  private commitSequence = 1

  private constructor(
    readonly origin: string,
    private readonly workingDirectory: string,
  ) {}

  static async create(root: string, id: string): Promise<RepositoryFixture> {
    const origin = join(root, `${id}.git`)
    const workingDirectory = join(root, `${id}-source`)
    runGit(["init", "--bare", origin])
    runGit(["init", workingDirectory])
    runGit(["config", "user.email", "fixture@example.invalid"], workingDirectory)
    runGit(["config", "user.name", "Fixture"], workingDirectory)
    runGit(["remote", "add", "origin", origin], workingDirectory)
    const fixture = new RepositoryFixture(origin, workingDirectory)
    await fixture.advance()
    runGit(["branch", "-M", "main"], workingDirectory)
    runGit(["push", "--set-upstream", "origin", "main"], workingDirectory)
    runGit(["symbolic-ref", "HEAD", "refs/heads/main"], origin)
    return fixture
  }

  async advance(): Promise<string> {
    await writeFile(join(this.workingDirectory, "fixture.txt"), `revision ${this.commitSequence++}\n`)
    runGit(["add", "fixture.txt"], this.workingDirectory)
    runGit(["commit", "-m", "advance fixture"], this.workingDirectory)
    if (runGit(["branch", "--show-current"], this.workingDirectory) === "main") {
      runGit(["push", "origin", "main"], this.workingDirectory)
    }
    return this.head()
  }

  head(): string {
    return runGit(["rev-parse", "HEAD"], this.workingDirectory)
  }
}

async function createTestRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "cortex-provisioning-test-"))
  temporaryDirectories.push(root)
  return root
}

function descriptor(
  repositories: ProvisioningDescriptor["repositories"],
  primaryRepositoryId = repositories[0]?.id ?? "missing",
): ProvisioningDescriptor {
  return {
    schemaVersion: 1,
    primaryRepositoryId,
    repositories,
    layout: "repos",
  }
}

async function writeDescriptor(root: string, value: unknown): Promise<string> {
  const path = join(root, "provisioning.v1.json")
  await writeFile(path, `${JSON.stringify(value)}\n`)
  return path
}

async function provision(root: string, value: unknown, environment?: Record<string, string | undefined>) {
  return provisionFromFile({
    provisioningFile: await writeDescriptor(root, value),
    workspaceDirectory: join(root, "workspace"),
    environment,
  })
}

function repositoryHead(path: string): string {
  return runGit(["rev-parse", "HEAD"], path)
}

async function filesUnder(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true })
  return entries.map((entry) => join(root, entry))
}

describe("provisioning descriptor v1", () => {
  const valid = descriptor([{ id: "primary", origin: "/tmp/primary.git", ref: "main" }])

  test.each([
    ["unknown schema", { ...valid, schemaVersion: 2 }, "unsupported schemaVersion"],
    ["unknown field", { ...valid, catalog: "default" }, "unknown descriptor field"],
    ["unsafe repository id", descriptor([{ id: "../escape", origin: "/tmp/a.git", ref: "main" }], "../escape"), "unsafe repository id"],
    ["hidden repository id", descriptor([{ id: ".git", origin: "/tmp/a.git", ref: "main" }], ".git"), "unsafe repository id"],
    ["trailing-dot repository id", descriptor([{ id: "primary.", origin: "/tmp/a.git", ref: "main" }], "primary."), "unsafe repository id"],
    ["duplicate repository id", descriptor([
      { id: "same", origin: "/tmp/a.git", ref: "main" },
      { id: "same", origin: "/tmp/b.git", ref: "main" },
    ], "same"), "duplicate repository id"],
    ["URL userinfo", descriptor([{ id: "primary", origin: "https://token@example.invalid/repo.git", ref: "main" }]), "credential-bearing repository origin"],
    ["URL password", descriptor([{ id: "primary", origin: "https://user:secret@example.invalid/repo.git", ref: "main" }]), "credential-bearing repository origin"],
    ["credential query", descriptor([{ id: "primary", origin: "https://example.invalid/repo.git?token=secret", ref: "main" }]), "credential-bearing repository origin"],
    ["scp userinfo", descriptor([{ id: "primary", origin: "git@example.invalid:repo.git", ref: "main" }]), "credential-bearing repository origin"],
    ["unsafe ref", descriptor([{ id: "primary", origin: "/tmp/a.git", ref: "refs/heads/main..other" }]), "invalid repository ref"],
    ["option-like ref", descriptor([{ id: "primary", origin: "/tmp/a.git", ref: "--upload-pack=bad" }]), "invalid repository ref"],
    ["missing primary", descriptor([{ id: "secondary", origin: "/tmp/a.git", ref: "main" }], "primary"), "primaryRepositoryId is not present"],
    ["unsafe layout", { ...valid, layout: "../repos" }, "unsupported repository layout"],
    ["non-string profile", { ...valid, profileId: { preset: "secret" } }, "profileId must be a string"],
  ])("rejects %s", (_name, value, message) => {
    expect(() => parseProvisioningDescriptor(value)).toThrow(message as string)
  })

  test("returns profileId as opaque metadata without changing it", () => {
    const value = { ...valid, profileId: "customer-owned/profile:v7" }
    expect(parseProvisioningDescriptor(value).profileId).toBe(value.profileId)
  })
})

describe("repository set provisioning", () => {
  test("admits one repository and returns its primary directory and ordered map", async () => {
    const root = await createTestRoot()
    const primary = await RepositoryFixture.create(root, "primary")

    const result = await provision(root, {
      ...descriptor([{ id: "primary", origin: primary.origin, ref: "main" }]),
      profileId: "opaque-profile",
    })

    expect(result).toEqual({
      primaryDirectory: join(root, "workspace", "repos", "primary"),
      repositoryDirectories: { primary: join(root, "workspace", "repos", "primary") },
      profileId: "opaque-profile",
    })
    expect(repositoryHead(result.primaryDirectory)).toBe(primary.head())
  })

  test("admits two complementary repositories in descriptor order", async () => {
    const root = await createTestRoot()
    const application = await RepositoryFixture.create(root, "application")
    const operations = await RepositoryFixture.create(root, "operations")
    const value = descriptor([
      { id: "operations", origin: operations.origin, ref: "main" },
      { id: "application", origin: application.origin, ref: "main" },
    ], "application")

    const result = await provision(root, value)

    expect(Object.keys(result.repositoryDirectories)).toEqual(["operations", "application"])
    expect(result.primaryDirectory).toBe(result.repositoryDirectories.application)
    expect(repositoryHead(result.repositoryDirectories.operations)).toBe(operations.head())
    expect(repositoryHead(result.repositoryDirectories.application)).toBe(application.head())
  })

  test("is idempotent and updates a clean repository to a newer requested branch head", async () => {
    const root = await createTestRoot()
    const primary = await RepositoryFixture.create(root, "primary")
    const value = descriptor([{ id: "primary", origin: primary.origin, ref: "main" }])
    const first = await provision(root, value)
    const firstDirectoryIdentity = (await lstat(first.primaryDirectory)).ino

    expect(await provision(root, value)).toEqual(first)
    expect((await lstat(first.primaryDirectory)).ino).toBe(firstDirectoryIdentity)

    const updatedHead = await primary.advance()
    const updated = await provision(root, value)
    expect(updated).toEqual(first)
    expect(repositoryHead(updated.primaryDirectory)).toBe(updatedHead)
  })

  test("fails closed when an admitted origin does not match", async () => {
    const root = await createTestRoot()
    const primary = await RepositoryFixture.create(root, "primary")
    const value = descriptor([{ id: "primary", origin: primary.origin, ref: "main" }])
    const result = await provision(root, value)
    runGit(["remote", "set-url", "origin", `${primary.origin}-other`], result.primaryDirectory)

    await expect(provision(root, value)).rejects.toThrow("origin mismatch")
    expect(runGit(["remote", "get-url", "origin"], result.primaryDirectory)).toBe(`${primary.origin}-other`)
  })

  test("fails closed on a dirty admitted repository", async () => {
    const root = await createTestRoot()
    const primary = await RepositoryFixture.create(root, "primary")
    const value = descriptor([{ id: "primary", origin: primary.origin, ref: "main" }])
    const result = await provision(root, value)
    await writeFile(join(result.primaryDirectory, "uncommitted.txt"), "keep me\n")

    await expect(provision(root, value)).rejects.toThrow("not clean")
    expect(await readFile(join(result.primaryDirectory, "uncommitted.txt"), "utf8")).toBe("keep me\n")
  })

  test("fails closed when local history diverges from the requested ref", async () => {
    const root = await createTestRoot()
    const primary = await RepositoryFixture.create(root, "primary")
    const value = descriptor([{ id: "primary", origin: primary.origin, ref: "main" }])
    const result = await provision(root, value)
    runGit(["config", "user.email", "fixture@example.invalid"], result.primaryDirectory)
    runGit(["config", "user.name", "Fixture"], result.primaryDirectory)
    await writeFile(join(result.primaryDirectory, "local.txt"), "local commit\n")
    runGit(["add", "local.txt"], result.primaryDirectory)
    runGit(["commit", "-m", "local divergence"], result.primaryDirectory)
    const localHead = repositoryHead(result.primaryDirectory)

    await expect(provision(root, value)).rejects.toThrow("diverges from requested ref")
    expect(repositoryHead(result.primaryDirectory)).toBe(localHead)
  })

  test("leaves the previously admitted set unchanged when a later repository fails", async () => {
    const root = await createTestRoot()
    const first = await RepositoryFixture.create(root, "first")
    const second = await RepositoryFixture.create(root, "second")
    const initial = descriptor([
      { id: "first", origin: first.origin, ref: "main" },
      { id: "second", origin: second.origin, ref: "main" },
    ])
    const result = await provision(root, initial)
    const admittedHeads = Object.fromEntries(
      Object.entries(result.repositoryDirectories).map(([id, path]) => [id, repositoryHead(path)]),
    )
    await first.advance()

    await expect(provision(root, {
      ...initial,
      repositories: [initial.repositories[0], { ...initial.repositories[1], ref: "missing-ref" }],
    })).rejects.toThrow("Git operation failed")

    expect(repositoryHead(result.repositoryDirectories.first)).toBe(admittedHeads.first)
    expect(repositoryHead(result.repositoryDirectories.second)).toBe(admittedHeads.second)
  })

  test("does not publish a partial set on initial failure", async () => {
    const root = await createTestRoot()
    const first = await RepositoryFixture.create(root, "first")
    const second = await RepositoryFixture.create(root, "second")
    const value = descriptor([
      { id: "first", origin: first.origin, ref: "main" },
      { id: "second", origin: second.origin, ref: "missing-ref" },
    ])

    await expect(provision(root, value)).rejects.toThrow("Git operation failed")
    expect(await Bun.file(join(root, "workspace", "repos")).exists()).toBeFalse()
  })

  test("does not leak an injected token through argv traces, result, errors, or retained files", async () => {
    const root = await createTestRoot()
    const primary = await RepositoryFixture.create(root, "primary")
    const token = "never-retain-this-token-9b06a16d"
    const trace = join(root, "git.trace")
    const askpass = join(root, "askpass.sh")
    await writeFile(askpass, "#!/usr/bin/env sh\nprintf '%s' \"$SANDBOX_GIT_TOKEN\"\n")
    await chmod(askpass, 0o700)
    const value = descriptor([{ id: "primary", origin: primary.origin, ref: "main" }])
    const provisioningFile = await writeDescriptor(root, value)
    const workspace = join(root, "workspace")
    const environment = {
      ...process.env,
      GIT_ASKPASS: askpass,
      GIT_TRACE: trace,
      SANDBOX_GIT_TOKEN: token,
    }
    const child = Bun.spawn([
      process.execPath,
      join(import.meta.dir, "provisioning.ts"),
      "--provisioning-file",
      provisioningFile,
      "--workspace",
      workspace,
    ], { env: environment, stderr: "pipe", stdout: "pipe" })
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])
    const result = JSON.parse(stdout)

    expect(exitCode).toBe(0)
    expect(stderr).toBe("")
    expect(JSON.stringify(result)).not.toContain(token)
    expect(await readFile(trace, "utf8")).not.toContain(token)
    for (const path of await filesUnder(workspace)) {
      const file = Bun.file(path)
      if ((await file.stat()).isFile()) {
        expect(Buffer.from(await file.arrayBuffer()).includes(Buffer.from(token))).toBeFalse()
      }
    }

    await writeDescriptor(root, descriptor([{ id: "primary", origin: primary.origin, ref: "missing-ref" }]))
    const failure = Bun.spawn([
      process.execPath,
      join(import.meta.dir, "provisioning.ts"),
      "--provisioning-file",
      provisioningFile,
      "--workspace",
      workspace,
    ], { env: environment, stderr: "pipe", stdout: "pipe" })
    const [failureCode, failureStdout, failureStderr] = await Promise.all([
      failure.exited,
      new Response(failure.stdout).text(),
      new Response(failure.stderr).text(),
    ])
    expect(failureCode).toBe(78)
    expect(failureStdout).toBe("")
    expect(failureStderr).not.toContain(token)
  })
})
