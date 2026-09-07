import { ProcessingJobLeaseLostError } from '#services/processing_job_service'
import type {
  default as ProcessingJobService,
  ClaimedProcessingJob,
  SafeProcessingFailure,
} from '#services/processing_job_service'
import { ProcessingFailure } from '#services/material_processing_service'
import StorageCleanupService from '#services/storage_cleanup_service'
import type { StorageService } from '#services/storage_service'
import { DateTime } from 'luxon'

interface ProcessingService {
  process(jobId: number, now: DateTime, claimToken: string): Promise<void>
}

interface ProcessingWorkerOptions {
  jobs: ProcessingJobService
  processor: ProcessingService
  storage: StorageService
  cleanupTasks?: StorageCleanupService
}

export default class ProcessingWorker {
  private jobs: ProcessingJobService
  private processor: ProcessingService
  private storage: StorageService
  private cleanupTasks: StorageCleanupService

  constructor(options: ProcessingWorkerOptions) {
    this.jobs = options.jobs
    this.processor = options.processor
    this.storage = options.storage
    this.cleanupTasks = options.cleanupTasks ?? new StorageCleanupService()
  }

  async runOnce(now = DateTime.utc()): Promise<boolean> {
    const cleanupTask = await this.cleanupTasks.claimNext(now)
    if (cleanupTask) {
      try {
        await this.cleanupTasks.drain(cleanupTask, this.storage)
        if (!(await this.cleanupTasks.finish(cleanupTask))) {
          throw new ProcessingJobLeaseLostError()
        }
      } catch (error) {
        if (error instanceof ProcessingJobLeaseLostError) {
          return true
        }
        await this.cleanupTasks.release(cleanupTask, now)
      }
      return true
    }

    const job = await this.jobs.claimNext(now)
    if (!job) {
      return false
    }

    try {
      await this.drainPendingCleanup(job)
      if (job.cleanupOnly) {
        await this.jobs.finishCleanup(job, now)
        return true
      }

      await this.processor.process(job.id, now, job.claimToken)
      return true
    } catch (error) {
      if (error instanceof ProcessingJobLeaseLostError) {
        return true
      }
      if (job.cleanupOnly) {
        await this.jobs.releaseCleanupForRetry(job, now)
      } else {
        await this.jobs.finishFailure(job, toSafeFailure(error), now)
      }
      return true
    }
  }

  private async drainPendingCleanup(job: ClaimedProcessingJob): Promise<void> {
    const remainingKeys: string[] = []
    for (const key of job.pendingCleanupKeys ?? []) {
      try {
        await this.storage.deleteObject(key)
      } catch (error) {
        if (!isMissingObjectError(error)) {
          remainingKeys.push(key)
        }
      }
    }
    if (
      !(await this.jobs.updatePendingCleanupKeys(
        job,
        remainingKeys.length > 0 ? remainingKeys : null
      ))
    ) {
      throw new ProcessingJobLeaseLostError()
    }
    if (remainingKeys.length > 0) {
      throw new ProcessingFailure('PROCESSING_FAILED', true)
    }
    await this.cleanupOutputPrefix(job)
  }

  private async cleanupOutputPrefix(job: ClaimedProcessingJob): Promise<void> {
    if (!job.cleanupOnly || !job.outputPrefix) {
      return
    }

    const keys = await this.storage.listKeys(job.outputPrefix)
    for (const key of keys) {
      try {
        await this.storage.deleteObject(key)
      } catch (error) {
        if (!isMissingObjectError(error)) {
          throw error
        }
      }
    }
    const remainingOutputKeys = await this.storage.listKeys(job.outputPrefix)
    if (remainingOutputKeys.length > 0) {
      throw new Error('Private derivative prefix cleanup left objects behind')
    }
    if (!(await this.jobs.clearOutputPrefix(job))) {
      throw new ProcessingJobLeaseLostError()
    }
    job.merge({ outputPrefix: null })
  }
}

function toSafeFailure(error: unknown): SafeProcessingFailure {
  if (error instanceof ProcessingFailure) {
    return {
      code: toSafeCode(error.code),
      retryable: error.retryable,
    }
  }
  return { code: 'PROCESSING_ERROR', retryable: true }
}

function toSafeCode(code: string): SafeProcessingFailure['code'] {
  if (
    code === 'PDF_PAGE_LIMIT_EXCEEDED' ||
    code === 'ORIGINAL_NOT_FOUND' ||
    code === 'INVALID_INPUT'
  ) {
    return code
  }
  return 'PROCESSING_ERROR'
}

function isMissingObjectError(error: unknown): boolean {
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
