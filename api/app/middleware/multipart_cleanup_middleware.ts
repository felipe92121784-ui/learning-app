import type { HttpContext } from '@adonisjs/core/http'
import type { MultipartFile } from '@adonisjs/core/bodyparser'
import type { NextFn } from '@adonisjs/core/types/http'
import { unlink } from 'node:fs/promises'
import { collectMultipartFilePaths } from '#middleware/multipart_file_collector'

export default class MultipartCleanupMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    try {
      await next()
    } finally {
      await cleanupMultipartFiles(ctx)
    }
  }
}

export async function cleanupMultipartFiles(
  ctx: HttpContext,
  removeFile: (path: string) => Promise<void> = unlink
) {
  let files: unknown
  try {
    files = ctx.request.allFiles()
  } catch {
    return
  }

  await cleanupMultipartPaths(ctx, collectMultipartFilePaths(files), removeFile)
}

export async function cleanupMultipartPaths(
  ctx: Pick<HttpContext, 'logger'>,
  paths: Iterable<string>,
  removeFile: (path: string) => Promise<void> = unlink
) {
  await Promise.all([...new Set(paths)].map((path) => cleanupMultipartPath(path, ctx, removeFile)))
}

export async function cleanupMultipartFile(
  file: MultipartFile | null,
  logger: HttpContext['logger'],
  removeFile: (path: string) => Promise<void> = unlink
) {
  if (!file?.tmpPath) {
    return
  }

  await cleanupMultipartPath(file.tmpPath, { logger }, removeFile)
}

async function cleanupMultipartPath(
  path: string,
  ctx: Pick<HttpContext, 'logger'>,
  removeFile: (path: string) => Promise<void>
) {
  try {
    await removeFile(path)
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return
    }

    ctx.logger.error({ err: error }, 'Unable to clean up multipart temporary file')
  }
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
