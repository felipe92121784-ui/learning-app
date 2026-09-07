import type { DateTime } from 'luxon'
import type { Readable } from 'node:stream'
import sharp from 'sharp'

export interface ProtectedWatermarkInput {
  stream: Readable
  width: number
  height: number
  fullName: string
  email: string
  occurredAt: DateTime
}

export default class ProtectedWatermarkService {
  async apply(input: ProtectedWatermarkInput): Promise<Buffer> {
    const source = await streamToBuffer(input.stream)
    const label = [input.fullName, input.email, formatOccurredAt(input.occurredAt)].join(' · ')
    const watermark = Buffer.from(createWatermarkSvg(input.width, input.height, label))

    return sharp(source)
      .composite([{ input: watermark, top: 0, left: 0 }])
      .webp({ quality: 90 })
      .toBuffer()
  }
}

function createWatermarkSvg(width: number, height: number, label: string): string {
  if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1) {
    throw new Error('Watermark dimensions must be positive integers')
  }

  const tinyCanvasOverlay =
    Math.min(width, height) < 64
      ? `<rect width="100%" height="100%" fill="#111827" fill-opacity="0.24" />
    <path d="M0 ${height} L${width} 0" stroke="#ffffff" stroke-opacity="0.35" stroke-width="1" />`
      : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <pattern id="watermark" width="680" height="180" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
      <text x="24" y="92" fill="#111827" fill-opacity="0.24" stroke="#ffffff" stroke-opacity="0.3" stroke-width="1" font-family="Arial, sans-serif" font-size="18" font-weight="600">${escapeXml(label)}</text>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#watermark)" />
  ${tinyCanvasOverlay}
</svg>`
}

function formatOccurredAt(occurredAt: DateTime): string {
  return `${occurredAt.toUTC().toFormat('yyyy-LL-dd HH:mm:ss')} UTC`
}

function escapeXml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&apos;',
      '"': '&quot;',
    }
    return entities[character]
  })
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}
