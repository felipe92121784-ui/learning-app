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
