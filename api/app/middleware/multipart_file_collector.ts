/**
 * Collect temporary paths from the arbitrary nested value returned by
 * request.allFiles(). Multipart field names such as `file[retained]` can be
 * represented as nested objects, while repeated fields are represented as
 * arrays. The same temporary path can also appear in more than one branch.
 */
export function collectMultipartFilePaths(value: unknown): string[] {
  const paths = new Set<string>()
  const visited = new WeakSet<object>()

  const visit = (candidate: unknown) => {
    if (candidate === null || typeof candidate !== 'object') {
      return
    }

    if (visited.has(candidate)) {
      return
    }
    visited.add(candidate)

    const tmpPath = (candidate as { tmpPath?: unknown }).tmpPath
    if (typeof tmpPath === 'string' && tmpPath.length > 0) {
      paths.add(tmpPath)
    }

    if (Array.isArray(candidate)) {
      candidate.forEach(visit)
      return
    }

    Object.values(candidate).forEach(visit)
  }

  visit(value)
  return [...paths]
}
