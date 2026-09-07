import { randomUUID } from 'node:crypto'
import StorageCleanupTask from '#models/storage_cleanup_task'
import type { StorageService } from '#services/storage_service'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DateTime, type DateTime as DateTimeType } from 'luxon'

export type ClaimedStorageCleanupTask = StorageCleanupTask & { claimToken: string }

export default class StorageCleanupService {
  async schedule(
    trx: TransactionClientContract,
    input: { storagePrefixes: string[]; objectKeys: string[] }
  ): Promise<StorageCleanupTask> {
    return StorageCleanupTask.create(
      {
        storagePrefixes: [...new Set(input.storagePrefixes)],
        objectKeys: [...new Set(input.objectKeys)],
      },
      { client: trx }
    )
  }

  async claimNext(now: DateTimeType): Promise<ClaimedStorageCleanupTask | null> {
    return db.transaction(async (trx) => {
      const task = await StorageCleanupTask.query({ client: trx })
        .where((query) => {
          query.whereNull('locked_at').orWhere('lease_expires_at', '<=', now.toSQL()!)
        })
        .orderBy('id', 'asc')
        .forUpdate()
        .skipLocked()
        .first()
      if (!task) {
        return null
      }

      task.merge({
        lockedAt: now,
        leaseExpiresAt: now.plus({ minutes: 5 }),
        claimToken: randomUUID(),
      })
      task.useTransaction(trx)
      await task.save()
      return Object.assign(task, { claimToken: task.claimToken! }) as ClaimedStorageCleanupTask
    })
  }

  async claim(taskId: number, now: DateTimeType): Promise<ClaimedStorageCleanupTask | null> {
    return db.transaction(async (trx) => {
      const task = await StorageCleanupTask.query({ client: trx })
        .where('id', taskId)
        .where((query) => {
          query.whereNull('locked_at').orWhere('lease_expires_at', '<=', now.toSQL()!)
        })
        .forUpdate()
        .first()
      if (!task) {
        return null
      }

      task.merge({
        lockedAt: now,
        leaseExpiresAt: now.plus({ minutes: 5 }),
        claimToken: randomUUID(),
      })
      task.useTransaction(trx)
      await task.save()
      return Object.assign(task, { claimToken: task.claimToken! }) as ClaimedStorageCleanupTask
    })
  }

  async finish(task: ClaimedStorageCleanupTask): Promise<boolean> {
    const deleted = await this.owned(task).delete()
    return deleted[0] === 1
  }

  async release(task: ClaimedStorageCleanupTask, now: DateTimeType): Promise<boolean> {
    const updated = await this.owned(task).update({
      locked_at: null,
      lease_expires_at: null,
      updated_at: now.toSQL(),
    })
    return updated[0] === 1
  }

  async drain(task: ClaimedStorageCleanupTask, storage: StorageService): Promise<void> {
    for (const prefix of task.storagePrefixes) {
      const keys = await storage.listKeys(prefix)
      for (const key of keys) {
        await deletePrivateObject(storage, key)
      }
      const remainingKeys = await storage.listKeys(prefix)
      if (remainingKeys.length > 0) {
        throw new Error('Private cleanup prefix left objects behind')
      }
    }

    for (const key of task.objectKeys) {
      await deletePrivateObject(storage, key)
    }
  }

  private owned(task: ClaimedStorageCleanupTask) {
    return StorageCleanupTask.query()
      .where('id', task.id)
      .where('claim_token', task.claimToken)
      .where('lease_expires_at', '>', DateTime.utc().toSQL()!)
  }
}

async function deletePrivateObject(storage: StorageService, key: string): Promise<void> {
  try {
    await storage.deleteObject(key)
  } catch (error) {
    if (!isMissingObjectError(error)) {
      throw error
    }
  }
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
