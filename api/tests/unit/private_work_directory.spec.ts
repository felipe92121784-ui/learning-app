import { mkdtemp, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { withPrivateWorkDirectory, writePrivateWorkFile } from '#services/private_work_directory'

test('creates a 0700 workspace with 0600 files and removes it after success', async ({ assert }) => {
  let directory = ''

  await withPrivateWorkDirectory(async (workDirectory) => {
    directory = workDirectory
    const file = join(workDirectory, 'original')
    await writePrivateWorkFile(file, Buffer.from('private material'))

    assert.equal((await stat(workDirectory)).mode & 0o777, 0o700)
    assert.equal((await stat(file)).mode & 0o777, 0o600)
  })

  await assert.rejects(() => stat(directory))
})

test('removes the private workspace after a rendering error', async ({ assert }) => {
  let directory = ''

  await assert.rejects(
    () =>
      withPrivateWorkDirectory(async (workDirectory) => {
        directory = workDirectory
        await writeFile(join(workDirectory, 'partial'), 'partial', { mode: 0o600 })
        throw new Error('render failed')
      }),
    /render failed/
  )

  await assert.rejects(() => stat(directory))
})

test('does not reuse a prior workspace path', async ({ assert }) => {
  const first = await mkdtemp(join(tmpdir(), 'ideal-learning-test-'))
  let second = ''

  await withPrivateWorkDirectory(async (directory) => {
    second = directory
  })

  assert.notEqual(second, first)
})
