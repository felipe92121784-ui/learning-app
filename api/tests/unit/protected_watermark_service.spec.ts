import ProtectedWatermarkService from '#services/protected_watermark_service'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import sharp from 'sharp'
import { Readable } from 'node:stream'

test('composites an escaped diagonal user label into new WebP bytes', async ({ assert }) => {
  const source = await sharp({
    create: { width: 320, height: 200, channels: 3, background: '#ffffff' },
  })
    .png()
    .toBuffer()

  const result = await new ProtectedWatermarkService().apply({
    stream: Readable.from(source),
    width: 320,
    height: 200,
    fullName: 'Ana & <Aluna>',
    email: 'ana+viewer@example.test',
    occurredAt: DateTime.fromISO('2026-09-07T12:34:56.000Z', { zone: 'utc' }),
  })

  assert.notDeepEqual(result, source)
  const metadata = await sharp(result).metadata()
  assert.equal(metadata.format, 'webp')
  assert.equal(metadata.width, 320)
  assert.equal(metadata.height, 200)
})

test('changes decoded pixels even for minimum-sized edge tiles', async ({ assert }) => {
  const service = new ProtectedWatermarkService()
  const watermarkInput = {
    fullName: 'Ana Aluna',
    email: 'ana@example.test',
    occurredAt: DateTime.fromISO('2026-09-07T12:34:56.000Z', { zone: 'utc' }),
  }

  for (const [width, height, minimumChangedChannels] of [
    [1, 1, 1],
    [1, 256, 128],
  ] as const) {
    const source = await sharp({
      create: { width, height, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer()
    const result = await service.apply({
      stream: Readable.from(source),
      width,
      height,
      ...watermarkInput,
    })
    const sourcePixels = await sharp(source).raw().toBuffer()
    const resultPixels = await sharp(result).raw().toBuffer()
    const changedChannels = resultPixels.reduce(
      (count, channel, index) => count + (channel !== sourcePixels[index] ? 1 : 0),
      0
    )

    assert.isAtLeast(
      changedChannels,
      minimumChangedChannels,
      `expected ${width}x${height} watermark overlay to change decoded pixels`
    )
  }
})
