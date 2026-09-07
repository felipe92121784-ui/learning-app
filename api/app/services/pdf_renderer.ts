import { execFile as executeFile } from 'node:child_process'
import { chmod, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import sharp from 'sharp'

export const PDF_PAGE_LIMIT = 300

export class ProcessingFailure extends Error {
  constructor(
    readonly code: 'PDF_PAGE_LIMIT_EXCEEDED' | 'ORIGINAL_NOT_FOUND' | 'PROCESSING_FAILED',
    readonly retryable: boolean
  ) {
    super(code)
    this.name = 'ProcessingFailure'
  }
}

export interface RenderedDerivative {
  filename: string
  path: string
  mimeType: 'image/webp'
  pageNumber: number | null
  width: number
  height: number
  position: number
}

export interface CommandResult {
  stdout: string
  stderr: string
}

export type CommandRunner = (command: string, args: string[]) => Promise<CommandResult>

interface PdfRendererOptions {
  runCommand?: CommandRunner
}

export default class PdfRenderer {
  private runCommand: CommandRunner

  constructor(options: PdfRendererOptions = {}) {
    this.runCommand = options.runCommand ?? runCommand
  }

  async render(input: {
    source: string
    outputDirectory: string
  }): Promise<{ pages: RenderedDerivative[] }> {
    const pageCount = await this.pageCount(input.source)
    if (pageCount > PDF_PAGE_LIMIT) {
      throw new ProcessingFailure('PDF_PAGE_LIMIT_EXCEEDED', false)
    }

    const pages: RenderedDerivative[] = []
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      const prefix = join(input.outputDirectory, `pdf-page-${pageNumber}`)
      const pngPath = `${prefix}.png`
      const webpPath = `${prefix}.webp`

      await this.runCommand('pdftocairo', [
        '-f',
        String(pageNumber),
        '-l',
        String(pageNumber),
        '-png',
        '-singlefile',
        input.source,
        prefix,
      ])

      try {
        await chmod(pngPath, 0o600)
        const metadata = await sharp(pngPath).webp().toFile(webpPath)
        await chmod(webpPath, 0o600)
        pages.push({
          filename: `pdf-page-${pageNumber}.webp`,
          path: webpPath,
          mimeType: 'image/webp',
          pageNumber,
          width: metadata.width,
          height: metadata.height,
          position: pageNumber - 1,
        })
      } finally {
        await rm(pngPath, { force: true })
      }
    }

    return { pages }
  }

  private async pageCount(source: string): Promise<number> {
    const { stdout } = await this.runCommand('pdfinfo', [source])
    const match = /^Pages:\s*(\d+)\s*$/m.exec(stdout)
    const pageCount = match ? Number(match[1]) : Number.NaN
    if (!Number.isSafeInteger(pageCount) || pageCount < 1) {
      throw new ProcessingFailure('PROCESSING_FAILED', false)
    }
    return pageCount
  }
}

const execFile = promisify(executeFile)

async function runCommand(command: string, args: string[]): Promise<CommandResult> {
  const { stdout, stderr } = await execFile(command, args, { encoding: 'utf8' })
  return { stdout, stderr }
}
