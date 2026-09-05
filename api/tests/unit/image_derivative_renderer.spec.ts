import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from '@japa/runner'
import ImageDerivativeRenderer from '#services/image_derivative_renderer'

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL8DwAAAABJRU5ErkJggg==',
  'base64'
)

test('does not enlarge an image preview beyond its original dimensions', async ({ assert }) => {
  const directory = await mkdtemp(join(tmpdir(), 'ideal-learning-image-test-'))
  const source = join(directory, 'source.png')
  await writeFile(source, onePixelPng, { mode: 0o600 })

  try {
    const output = await new ImageDerivativeRenderer().render({ source, outputDirectory: directory })

    assert.equal(output.width, 1)
    assert.equal(output.height, 1)
    assert.equal(output.mimeType, 'image/webp')
    assert.equal((await stat(output.path)).mode & 0o777, 0o600)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
