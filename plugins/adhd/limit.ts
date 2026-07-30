/**
 * Minimal concurrency gate.
 *
 * Local rather than a dependency: the engine needs one counting semaphore and
 * nothing else, and the repository keeps a single lockfile describing a small
 * dependency graph.
 */

export type Limiter = <T>(task: () => Promise<T>) => Promise<T>

export function createLimiter(concurrency: number): Limiter {
  const max = Math.max(1, Math.floor(concurrency))
  let active = 0
  const waiting: Array<() => void> = []

  const release = () => {
    active--
    waiting.shift()?.()
  }

  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= max) {
      await new Promise<void>((resolve) => waiting.push(resolve))
    }
    active++
    try {
      return await task()
    } finally {
      release()
    }
  }
}
