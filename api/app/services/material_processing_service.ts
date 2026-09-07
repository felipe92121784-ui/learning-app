import { randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { chmod } from 'node:fs/promises'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import Material from '#models/material'
import MaterialDerivative from '#models/material_derivative'
import ProcessingJob from '#models/processing_job'
import ImageDerivativeRenderer, {
  type ImageRenderResult,
} from '#services/image_derivative_renderer'
import PdfRenderer, { ProcessingFailure, type RenderedDerivative } from '#services/pdf_renderer'
import { withPrivateWorkDirectory } from '#services/private_work_directory'
import type { StorageService } from '#services/storage_service'
import { ProcessingJobLeaseLostError } from '#services/processing_job_service'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'

export { ProcessingFailure }
export type { RenderedDerivative }

interface PdfRendererLike {
  render(input: {
    source: string
    outputDirectory: string
  }): Promise<{ pages: RenderedDerivative[] }>
}

interface ImageRendererLike {
  render(input: { source: string; outputDirectory: string }): Promise<ImageRenderResult>
}

interface MaterialProcessingServiceOptions {
  storage: StorageService
  pdfRenderer?: PdfRendererLike
  imageRenderer?: ImageRendererLike
}

export default class MaterialProcessingService {
  private storage: StorageService
  private pdfRenderer: PdfRendererLike
  private imageRenderer: ImageRendererLike

  constructor(options: MaterialProcessingServiceOptions) {
    this.storage = options.storage
    this.pdfRenderer = options.pdfRenderer ?? new PdfRenderer()
    this.imageRenderer = options.imageRenderer ?? new ImageDerivativeRenderer()
  }

  async process(jobId: number, now: DateTime, claimToken: string): Promise<void> {
    const job = await ProcessingJob.query()
      .where('id', jobId)
      .where('status', 'RUNNING')
      .where('claim_token', claimToken)
      .where('lease_expires_at', '>', DateTime.utc().toSQL()!)
      .preload('material')
      .first()
    if (!job) {
      throw new ProcessingJobLeaseLostError()
    }

    await this.reclaimPreviousOutputPrefix(job, claimToken)

    const runId = randomUUID()
    const outputPrefix = `derivatives/${job.materialId}/${runId}/`
    const uploadedKeys: string[] = []
    try {
      await withPrivateWorkDirectory(async (directory) => {
        const originalPath = join(directory, 'original')
        await this.downloadOriginal(job.material.storageKey, originalPath)

        const outputs = await this.renderDerivatives(job, originalPath, directory)
        await this.persistOutputPrefix(job, outputPrefix, claimToken)

        for (const output of outputs) {
          const key = `${outputPrefix}${output.filename}`
          uploadedKeys.push(key)
          await this.storage.putObject({
            key,
            body: createReadStream(output.path),
            contentType: 'image/webp',
          })
        }

        await this.persistSuccessfulRun(job, outputs, uploadedKeys, now, claimToken)
      })
    } catch (error) {
      if (job.outputPrefix) {
        try {
          await this.deleteRunPrefix(job.outputPrefix, uploadedKeys)
        } catch {
          throw new ProcessingFailure('PROCESSING_FAILED', true)
        }
      }
      if (error instanceof ProcessingJobLeaseLostError) {
        throw error
      }
      if (error instanceof ProcessingFailure) {
        throw error
      }
      throw new ProcessingFailure('PROCESSING_FAILED', isRetryableFailure(error))
    }
  }

  private async persistOutputPrefix(
    job: ProcessingJob,
    outputPrefix: string,
    claimToken: string
  ): Promise<void> {
    await this.updateOwnedJob(job.id, claimToken, { output_prefix: outputPrefix })
    job.merge({ outputPrefix })
  }

  private async reclaimPreviousOutputPrefix(job: ProcessingJob, claimToken: string): Promise<void> {
    if (!job.outputPrefix) {
      return
    }

    try {
      await this.deleteRunPrefix(job.outputPrefix, [])
      await this.updateOwnedJob(job.id, claimToken, { output_prefix: null })
      job.merge({ outputPrefix: null })
    } catch (error) {
      if (error instanceof ProcessingJobLeaseLostError) {
        throw error
      }
      throw new ProcessingFailure('PROCESSING_FAILED', true)
    }
  }

  private async downloadOriginal(storageKey: string, destination: string): Promise<void> {
    try {
      const original = await this.storage.getObject(storageKey)
      await pipeline(original, createWriteStream(destination, { mode: 0o600 }))
      await chmod(destination, 0o600)
    } catch (error) {
      if (isMissingObjectError(error)) {
        throw new ProcessingFailure('ORIGINAL_NOT_FOUND', false)
      }
      throw error
    }
  }

  private async renderDerivatives(
    job: ProcessingJob,
    source: string,
    outputDirectory: string
  ): Promise<RenderedDerivative[]> {
    if (job.kind === 'PDF_RENDER') {
      const rendered = await this.pdfRenderer.render({ source, outputDirectory })
      return rendered.pages
    }

    const rendered = await this.imageRenderer.render({ source, outputDirectory })
    if (rendered.mode === 'TILES') {
      throw new ProcessingFailure('PROCESSING_FAILED', false)
    }

    return rendered.artifacts
  }

  private async persistSuccessfulRun(
    job: ProcessingJob,
    outputs: RenderedDerivative[],
    uploadedKeys: string[],
    now: DateTime,
    claimToken: string
  ): Promise<void> {
    await db.transaction(async (trx) => {
      const currentJob = await ProcessingJob.query({ client: trx })
        .where('id', job.id)
        .forUpdate()
        .first()
      if (!currentJob) {
        throw new ProcessingJobLeaseLostError()
      }
      // Hold the shared deletion lock while the guarded success transition and
      // the lifecycle writes run in one transaction. A later write failure
      // rolls the job back to RUNNING.
      const material = await Material.query({ client: trx })
        .where('id', job.materialId)
        .forUpdate()
        .first()
      if (!material) {
        throw new Error('Material deleted while processing')
      }

      const previousDerivatives = await MaterialDerivative.query({ client: trx })
        .where('material_id', material.id)
        .orderBy('position', 'asc')
      const pendingCleanupKeys = [
        ...new Set([
          ...(currentJob.pendingCleanupKeys ?? []),
          ...previousDerivatives.map((derivative) => derivative.storageKey),
        ]),
      ]
      const updated = await ProcessingJob.query({ client: trx })
        .where('id', job.id)
        .where('status', 'RUNNING')
        .where('claim_token', claimToken)
        .where('lease_expires_at', '>', DateTime.utc().toSQL()!)
        .update({
          status: 'SUCCEEDED',
          locked_at: null,
          lease_expires_at: null,
          last_error_code: null,
          output_prefix: null,
          pending_cleanup_keys:
            pendingCleanupKeys.length > 0 ? JSON.stringify(pendingCleanupKeys) : null,
          updated_at: now.toSQL(),
        })
      if (updated[0] !== 1) {
        throw new ProcessingJobLeaseLostError()
      }

      await MaterialDerivative.query({ client: trx }).where('material_id', material.id).delete()

      await MaterialDerivative.createMany(
        outputs.map((output, index) => ({
          materialId: material.id,
          kind: output.pageNumber === null ? 'IMAGE_PREVIEW' : 'PDF_PAGE',
          storageKey: uploadedKeys[index],
          mimeType: output.mimeType,
          pageNumber: output.pageNumber,
          width: output.width,
          height: output.height,
          position: output.position,
        })),
        { client: trx }
      )

      material.merge({ processingStatus: 'READY', processingErrorCode: null })
      material.useTransaction(trx)
      await material.save()

      job.merge({
        status: 'SUCCEEDED',
        lockedAt: null,
        leaseExpiresAt: null,
        lastErrorCode: null,
        outputPrefix: null,
        pendingCleanupKeys: pendingCleanupKeys.length > 0 ? pendingCleanupKeys : null,
        updatedAt: now,
      })
    })
  }

  private async updateOwnedJob(
    jobId: number,
    claimToken: string,
    values: Record<string, unknown>
  ): Promise<void> {
    const updated = await ProcessingJob.query()
      .where('id', jobId)
      .where('status', 'RUNNING')
      .where('claim_token', claimToken)
      .where('lease_expires_at', '>', DateTime.utc().toSQL()!)
      .update(values)
    if (updated[0] !== 1) {
      throw new ProcessingJobLeaseLostError()
    }
  }

  private async deleteRunPrefix(outputPrefix: string, uploadedKeys: string[]): Promise<void> {
    const listedKeys = await this.storage.listKeys(outputPrefix)
    const keys = new Set([...uploadedKeys, ...listedKeys])
    const results = await Promise.allSettled(
      [...keys].map(async (key) => {
        try {
          await this.storage.deleteObject(key)
        } catch (error) {
          if (!isMissingObjectError(error)) {
            throw error
          }
        }
      })
    )
    const failure = results.find((result) => result.status === 'rejected')
    if (failure?.status === 'rejected') {
      throw failure.reason
    }
    const remainingKeys = await this.storage.listKeys(outputPrefix)
    if (remainingKeys.length > 0) {
      throw new Error('Private derivative prefix cleanup left objects behind')
    }
  }
}

function isMissingObjectError(error: unknown) {
  if (typeof error !== 'object' || error === null) {
    return false
  }
  const response = error as {
    name?: string
    code?: string
    $metadata?: { httpStatusCode?: number }
  }
  return (
    response.name === 'NotFound' ||
    response.name === 'NoSuchKey' ||
    response.code === 'NoSuchKey' ||
    response.$metadata?.httpStatusCode === 404
  )
}

function isRetryableFailure(error: unknown) {
  return !isMissingObjectError(error)
}
