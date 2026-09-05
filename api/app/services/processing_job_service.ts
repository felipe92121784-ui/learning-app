import Material from '#models/material'
import ProcessingJob from '#models/processing_job'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { DateTime } from 'luxon'

export type ClaimedProcessingJob = ProcessingJob

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

  async claimNext(now: DateTime): Promise<ClaimedProcessingJob | null> {
    return db.transaction(async (trx) => {
      const job = await ProcessingJob.query({ client: trx })
        .where('status', 'PENDING')
        .orderBy('id', 'asc')
        .forUpdate()
        .skipLocked()
        .first()
      if (!job) {
        return null
      }

      job.merge({
        status: 'RUNNING',
        lockedAt: now,
        leaseExpiresAt: now.plus({ minutes: 5 }),
      })
      job.useTransaction(trx)
      await job.save()
      return job
    })
  }
}

export default ProcessingJobService
