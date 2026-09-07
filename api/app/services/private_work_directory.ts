import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export async function withPrivateWorkDirectory<T>(
  callback: (directory: string) => Promise<T>
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'ideal-learning-worker-'))
  await chmod(directory, 0o700)

  try {
    return await callback(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

export async function writePrivateWorkFile(path: string, contents: string | Buffer): Promise<void> {
  await writeFile(path, contents, { mode: 0o600 })
  await chmod(path, 0o600)
}
