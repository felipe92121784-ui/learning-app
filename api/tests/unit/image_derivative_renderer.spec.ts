import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from '@japa/runner'
import ImageDerivativeRenderer from '#services/image_derivative_renderer'
import sharp from 'sharp'

test('does not enlarge an image preview beyond its original dimensions', async ({ assert }) => {
  const directory = await mkdtemp(join(tmpdir(), 'ideal-learning-image-test-'))
  const source = join(directory, 'source.png')
  await sharp({ create: { width: 1, height: 1, channels: 3, background: '#ffffff' } })
    .png()
    .toFile(source)

  try {
    const output = await new ImageDerivativeRenderer().render({
      source,
      outputDirectory: directory,
    })

    assert.equal(output.width, 1)
    assert.equal(output.height, 1)
    assert.equal(output.mimeType, 'image/webp')
    const outputStats = await stat(output.path)
    assert.equal(outputStats.mode & 0o777, 0o600)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('caps a large non-square image while preserving its aspect ratio', async ({ assert }) => {
  const directory = await mkdtemp(join(tmpdir(), 'ideal-learning-image-test-'))
  const source = join(directory, 'wide.png')
  await sharp({ create: { width: 4000, height: 1000, channels: 3, background: '#ffffff' } })
    .png()
    .toFile(source)

  try {
    const output = await new ImageDerivativeRenderer().render({
      source,
      outputDirectory: directory,
    })

    assert.equal(output.width, 2560)
    assert.equal(output.height, 640)
    assert.isTrue(Math.max(output.width, output.height) <= 2560)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
