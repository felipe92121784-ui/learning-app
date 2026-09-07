import { chmod, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import env from '#start/env'
import sharp from 'sharp'
import type { RenderedDerivative } from '#services/pdf_renderer'

export const IMAGE_PREVIEW_MAX_EDGE = 2560

export interface RenderedTileManifest {
  width: number
  height: number
  tileSize: number
  minLevel: number
  maxLevel: number
}

export interface RenderedStorageArtifact {
  relativeKey: string
  path: string
  mimeType: 'image/webp'
  width: number
  height: number
}

export type ImageRenderResult =
  | { mode: 'PREVIEW'; artifacts: RenderedDerivative[] }
  | { mode: 'TILES'; manifest: RenderedTileManifest; artifacts: RenderedStorageArtifact[] }

interface ImageDerivativeRendererOptions {
  tileThresholdPx?: number
  tileSize?: number
}

export default class ImageDerivativeRenderer {
  private tileThresholdPx: number
  private tileSize: number

  constructor(options: ImageDerivativeRendererOptions = {}) {
    this.tileThresholdPx = positiveInteger(
      'tileThresholdPx',
      options.tileThresholdPx ?? env.get('IMAGE_TILE_THRESHOLD_PX')
    )
    this.tileSize = positiveInteger('tileSize', options.tileSize ?? env.get('IMAGE_TILE_SIZE'))
  }

  async render(input: { source: string; outputDirectory: string }): Promise<ImageRenderResult> {
    const metadata = await sharp(input.source).metadata()
    const width = metadata.width
    const height = metadata.height
    if (!width || !height) {
      throw new Error('Image dimensions are unavailable')
    }

    if (Math.max(width, height) <= this.tileThresholdPx) {
      return { mode: 'PREVIEW', artifacts: [await this.renderPreview(input)] }
    }

    return this.renderTiles(input, width, height)
  }

  private async renderPreview(input: {
    source: string
    outputDirectory: string
  }): Promise<RenderedDerivative> {
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

  private async renderTiles(
    input: { source: string; outputDirectory: string },
    width: number,
    height: number
  ): Promise<Extract<ImageRenderResult, { mode: 'TILES' }>> {
    const maxLevel = Math.ceil(Math.log2(Math.max(width, height)))
    const manifest: RenderedTileManifest = {
      width,
      height,
      tileSize: this.tileSize,
      minLevel: 0,
      maxLevel,
    }
    const artifacts: RenderedStorageArtifact[] = []

    for (let level = manifest.minLevel; level <= manifest.maxLevel; level++) {
      const scale = 2 ** (manifest.maxLevel - level)
      const levelWidth = Math.ceil(width / scale)
      const levelHeight = Math.ceil(height / scale)
      const columns = Math.ceil(levelWidth / this.tileSize)
      const rows = Math.ceil(levelHeight / this.tileSize)

      for (let column = 0; column < columns; column++) {
        for (let row = 0; row < rows; row++) {
          const tileWidth = Math.min(this.tileSize, levelWidth - column * this.tileSize)
          const tileHeight = Math.min(this.tileSize, levelHeight - row * this.tileSize)
          const relativeKey = `tiles/${level}/${column}/${row}.webp`
          const path = join(input.outputDirectory, relativeKey)
          await mkdir(join(input.outputDirectory, 'tiles', String(level), String(column)), {
            recursive: true,
          })

          const output = await sharp(input.source)
            .resize({ width: levelWidth, height: levelHeight, fit: 'fill' })
            .extract({
              left: column * this.tileSize,
              top: row * this.tileSize,
              width: tileWidth,
              height: tileHeight,
            })
            .webp()
            .toFile(path)
          await chmod(path, 0o600)

          artifacts.push({
            relativeKey,
            path,
            mimeType: 'image/webp',
            width: output.width,
            height: output.height,
          })
        }
      }
    }

    return { mode: 'TILES', manifest, artifacts }
  }
}

function positiveInteger(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`)
  }

  return value
}
