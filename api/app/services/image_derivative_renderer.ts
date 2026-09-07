import { chmod } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import type { RenderedDerivative } from '#services/pdf_renderer'

export const IMAGE_PREVIEW_MAX_EDGE = 2560

export default class ImageDerivativeRenderer {
  async render(input: { source: string; outputDirectory: string }): Promise<RenderedDerivative> {
    const path = join(input.outputDirectory, 'preview.webp')
    const metadata = await sharp(input.source)
      .resize({
        width: IMAGE_PREVIEW_MAX_EDGE,
        height: IMAGE_PREVIEW_MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp()
      .toFile(path)
    await chmod(path, 0o600)

    return {
      filename: 'preview.webp',
      path,
      mimeType: 'image/webp',
      pageNumber: null,
      width: metadata.width,
      height: metadata.height,
      position: 0,
    }
  }
}
