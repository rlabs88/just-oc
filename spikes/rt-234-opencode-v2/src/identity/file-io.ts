import {
  appendFile, mkdir, open, readFile, readdir, rename, unlink, writeFile,
} from "node:fs/promises"
import { dirname } from "node:path"

export async function readJson(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, "utf8"))
  } catch (error) {
    if (isMissing(error)) return null
    throw error
  }
}

export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${crypto.randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(value)}\n`, "utf8")
  await rename(temporary, path)
}

export async function appendJsonLine(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await appendFile(path, `${JSON.stringify(value)}\n`, "utf8")
}

export async function readJsonLines(path: string): Promise<unknown[]> {
  try {
    const text = await readFile(path, "utf8")
    return text.split("\n").filter(Boolean).map((line) => JSON.parse(line))
  } catch (error) {
    if (isMissing(error)) return []
    throw error
  }
}

export async function listNames(path: string): Promise<string[]> {
  try {
    return await readdir(path)
  } catch (error) {
    if (isMissing(error)) return []
    throw error
  }
}

export async function createLock(path: string, token: string): Promise<() => Promise<void>> {
  await mkdir(dirname(path), { recursive: true })
  let handle
  try {
    handle = await open(path, "wx")
    await handle.writeFile(token, "utf8")
  } catch (error) {
    await handle?.close()
    if (isExists(error)) throw new Error("Identity lease conflict")
    throw error
  }
  await handle.close()
  let released = false
  return async () => {
    if (released) return
    released = true
    if (await readFile(path, "utf8") === token) await unlink(path)
  }
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT"
}

function isExists(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "EEXIST"
}
