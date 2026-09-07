import Material from '#models/material'
import ProcessingJob from '#models/processing_job'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { randomUUID } from 'node:crypto'
import { DateTime, type DateTime as DateTimeType } from 'luxon'

export type SafeProcessingFailure = {
  code: NonNullable<ProcessingJob['lastErrorCode']>
  retryable: boolean
}

export type ClaimedProcessingJob = ProcessingJob & {
  claimToken: string
  cleanupOnly: boolean
  cleanupStatus: 'SUCCEEDED' | 'FAILED' | undefined
}

export class ProcessingJobLeaseLostError extends Error {
  constructor() {
    super('Processing job lease ownership was lost')
  }
}

export class ProcessingJobService {
  async enqueueForMaterial(
    trx: TransactionClientContract,
    material: Material
  ): Promise<ProcessingJob | null> {
    if (material.type === 'ZIP') {
      return null
    }

    await Material.query({ client: trx }).where('id', material.id).forUpdate().firstOrFail()
    const activeJob = await ProcessingJob.query({ client: trx })
      .where('material_id', material.id)
      .whereIn('status', ['PENDING', 'RUNNING'])
      .first()
    if (activeJob) {
      return null
    }

    return ProcessingJob.create(
      {
        materialId: material.id,
        kind: material.type === 'PDF' ? 'PDF_RENDER' : 'IMAGE_DERIVATIVE',
        status: 'PENDING',
        attempts: 0,
        maxAttempts: 3,
      },
      { client: trx }
    )
  }

  async claimNext(now: DateTimeType): Promise<ClaimedProcessingJob | null> {
    return db.transaction(async (trx) => {
      const job = await ProcessingJob.query({ client: trx })
        .where((query) => {
          query
            .where('status', 'PENDING')
            .orWhere((expiredLease) => {
              expiredLease.where('status', 'RUNNING').where('lease_expires_at', '<=', now.toISO()!)
            })
            .orWhere((cleanupCandidate) => {
              cleanupCandidate.whereIn('status', ['SUCCEEDED', 'FAILED']).where((cleanupState) => {
                cleanupState.whereNotNull('pending_cleanup_keys').orWhereNotNull('output_prefix')
              })
            })
        })
        .orderBy('id', 'asc')
        .forUpdate()
        .skipLocked()
        .first()
      if (!job) {
        return null
      }

      const cleanupOnly =
        (job.status === 'SUCCEEDED' || job.status === 'FAILED') &&
        ((job.pendingCleanupKeys?.length ?? 0) > 0 || job.outputPrefix !== null)
      const cleanupStatus: ClaimedProcessingJob['cleanupStatus'] = cleanupOnly
        ? (job.status as 'SUCCEEDED' | 'FAILED')
        : undefined
      job.merge({
        status: 'RUNNING',
        lockedAt: now,
        leaseExpiresAt: now.plus({ minutes: 5 }),
        claimToken: randomUUID(),
      })
      job.useTransaction(trx)
      await job.save()
      return Object.assign(job, {
        claimToken: job.claimToken!,
        cleanupOnly,
        cleanupStatus,
      }) as ClaimedProcessingJob
    })
  }

  async updatePendingCleanupKeys(
    job: ClaimedProcessingJob,
    keys: string[] | null
  ): Promise<boolean> {
    return this.updateOwned(job, {
      pending_cleanup_keys: keys === null ? null : JSON.stringify(keys),
    })
  }

  async clearOutputPrefix(job: ClaimedProcessingJob): Promise<boolean> {
    return this.updateOwned(job, { output_prefix: null })
  }

  async finishCleanup(job: ClaimedProcessingJob, now: DateTimeType): Promise<boolean> {
    return this.updateOwned(job, {
      status: job.cleanupStatus ?? 'SUCCEEDED',
      locked_at: null,
      lease_expires_at: null,
      updated_at: now.toSQL(),
    })
  }

  async releaseCleanupForRetry(job: ClaimedProcessingJob, now: DateTimeType): Promise<boolean> {
    return this.updateOwned(job, {
      status: job.cleanupStatus ?? 'SUCCEEDED',
      locked_at: null,
      lease_expires_at: null,
      last_error_code: 'PROCESSING_ERROR',
      updated_at: now.toSQL(),
    })
  }

  async finishFailure(
    job: ClaimedProcessingJob,
    failure: SafeProcessingFailure,
    now: DateTimeType
  ): Promise<boolean> {
    try {
      return await db.transaction(async (trx) => {
        const current = await ProcessingJob.query({ client: trx })
          .where('id', job.id)
          .forUpdate()
          .first()
        if (!current) {
          return false
        }

        const attempts = current.attempts + 1
        const failed = !failure.retryable || attempts >= current.maxAttempts

        const updated = await this.updateOwned(
          job,
          {
            attempts,
            status: failed ? 'FAILED' : 'PENDING',
            locked_at: null,
            lease_expires_at: null,
            last_error_code: failure.code,
            updated_at: now.toSQL(),
          },
          trx
        )
        if (!updated) {
          return false
        }

        if (failed) {
          const material = await Material.query({ client: trx })
            .where('id', current.materialId)
            .forUpdate()
            .first()
          if (material) {
            material.merge({ processingStatus: 'FAILED', processingErrorCode: failure.code })
            material.useTransaction(trx)
            await material.save()
          }
        }
        return true
      })
    } catch (error) {
      if (error instanceof ProcessingJobLeaseLostError) {
        return false
      }
      throw error
    }
  }

  private async updateOwned(
    job: ClaimedProcessingJob,
    values: Record<string, unknown>,
    client?: TransactionClientContract
  ): Promise<boolean> {
    const updated = await ProcessingJob.query({ client })
      .where('id', job.id)
      .where('status', 'RUNNING')
      .where('claim_token', job.claimToken)
      .where('lease_expires_at', '>', DateTime.utc().toSQL()!)
      .update(values)
    return updated[0] === 1
  }
}

export default ProcessingJobService
