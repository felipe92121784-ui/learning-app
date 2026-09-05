import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import bodyParserConfig, { privateMultipartFileName } from '#config/bodyparser'
import { chmod } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { collectMultipartFilePaths } from '#middleware/multipart_file_collector'
import { cleanupMultipartPaths } from '#middleware/multipart_cleanup_middleware'

export default class MultipartFileSecurityMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    try {
      await processMultipartFiles(ctx)
      await secureMultipartFiles(ctx)
    } catch (error) {
      ctx.logger.error({ err: error }, 'Unable to secure multipart temporary files')
      return ctx.response.internalServerError({ message: 'Unable to process upload' })
    }

    return next()
  }
}

/**
 * Process multipart files only after route middleware has authorized the
 * request. The global bodyparser creates the multipart stream but does not
 * write file parts to disk.
 */
export async function processMultipartFiles(ctx: HttpContext) {
  if (!ctx.request.multipart) {
    return
  }

  const temporaryPaths: string[] = []
  ctx.request.multipart.onFile('*', { deferValidations: true }, async (part, reporter) => {
    const tmpPath = privateMultipartFileName()
    temporaryPaths.push(tmpPath)

    try {
      part.pause()
      part.on('data', reporter)
      await pipeline(part, createWriteStream(tmpPath, { mode: 0o600 }))
      await chmod(tmpPath, 0o600)
      return { tmpPath }
    } catch (error) {
      await unlink(tmpPath).catch(() => undefined)
      throw error
    }
  })

  try {
    await ctx.request.multipart.process({ limit: bodyParserConfig.multipart.limit })
  } catch (error) {
    await cleanupMultipartPaths(ctx, temporaryPaths)
    throw error
  }
}

export async function secureMultipartFiles(
  ctx: HttpContext,
  setMode: (path: string, mode: number) => Promise<void> = chmod
) {
  let files: unknown
  try {
    files = ctx.request.allFiles()
  } catch {
    return
  }

  await Promise.all(collectMultipartFilePaths(files).map((path) => setMode(path, 0o600)))
}
