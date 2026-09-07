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

    assert.equal(output.mode, 'PREVIEW')
    if (output.mode !== 'PREVIEW') {
      throw new Error('Expected a preview result')
    }
    const preview = output.artifacts[0]
    assert.equal(preview.width, 1)
    assert.equal(preview.height, 1)
    assert.equal(preview.mimeType, 'image/webp')
    const outputStats = await stat(preview.path)
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

    assert.equal(output.mode, 'PREVIEW')
    if (output.mode !== 'PREVIEW') {
      throw new Error('Expected a preview result')
    }
    const preview = output.artifacts[0]
    assert.equal(preview.width, 2560)
    assert.equal(preview.height, 640)
    assert.isTrue(Math.max(preview.width, preview.height) <= 2560)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('uses a preview when the longest source edge is exactly the tile threshold', async ({
  assert,
}) => {
  const directory = await mkdtemp(join(tmpdir(), 'ideal-learning-image-test-'))
  const source = join(directory, 'threshold.png')
  await sharp({ create: { width: 4096, height: 1, channels: 3, background: '#ffffff' } })
    .png()
    .toFile(source)

  try {
    const result = await new ImageDerivativeRenderer({
      tileThresholdPx: 4096,
      tileSize: 256,
    }).render({
      source,
      outputDirectory: directory,
    })

    assert.equal(result.mode, 'PREVIEW')
    if (result.mode === 'PREVIEW') {
      assert.lengthOf(result.artifacts, 1)
      assert.equal(result.artifacts[0].filename, 'preview.webp')
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('renders a deterministic private WebP pyramid strictly above the tile threshold', async ({
  assert,
}) => {
  const directory = await mkdtemp(join(tmpdir(), 'ideal-learning-image-test-'))
  const source = join(directory, 'tiled.png')
  await sharp({ create: { width: 4097, height: 257, channels: 3, background: '#ffffff' } })
    .png()
    .toFile(source)

  try {
    const result = await new ImageDerivativeRenderer({
      tileThresholdPx: 4096,
      tileSize: 256,
    }).render({
      source,
      outputDirectory: directory,
    })

    assert.equal(result.mode, 'TILES')
    if (result.mode === 'TILES') {
      assert.deepEqual(result.manifest, {
        width: 4097,
        height: 257,
        tileSize: 256,
        minLevel: 0,
        maxLevel: 13,
      })
      assert.equal(result.artifacts[0].relativeKey, 'tiles/0/0/0.webp')
      assert.equal(result.artifacts.at(-1)?.relativeKey, 'tiles/13/16/1.webp')

      const edgeTile = result.artifacts.at(-1)!
      const metadata = await sharp(edgeTile.path).metadata()
      const outputStats = await stat(edgeTile.path)
      assert.equal(metadata.format, 'webp')
      assert.equal(metadata.width, 1)
      assert.equal(metadata.height, 1)
      assert.equal(outputStats.mode & 0o777, 0o600)
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
