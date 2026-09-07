import Course from '#models/course'
import CourseModule from '#models/course_module'
import Material from '#models/material'
import ProcessingJob from '#models/processing_job'
import StorageCleanupTask from '#models/storage_cleanup_task'
import { ProcessingFailure } from '#services/material_processing_service'
import ProcessingWorker from '#services/processing_worker'
import ProcessingJobService from '#services/processing_job_service'
import type { StorageService, PutObjectInput } from '#services/storage_service'
import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import type { Readable } from 'node:stream'

test.group('ProcessingWorker', (group) => {
  let cleanupDatabase: () => Promise<void>

  group.each.setup(async () => {
    cleanupDatabase = await testUtils.db().truncate()
    await cleanupDatabase()
  })

  group.each.teardown(async () => {
    await cleanupDatabase()
  })

  test('reclaims an expired running lease and completes the job once', async ({ assert }) => {
    const job = await createJob({ status: 'RUNNING', attempts: 1 })
    const now = DateTime.utc()
    job.merge({
      lockedAt: now.minus({ minutes: 6 }),
      leaseExpiresAt: now.minus({ minute: 1 }),
    })
    await job.save()
    const processor = succeedingProcessor()
    const worker = new ProcessingWorker({
      jobs: new ProcessingJobService(),
      processor,
      storage: new MemoryStorage(),
    })

    assert.isTrue(await worker.runOnce(now))
    await job.refresh()
    assert.equal(job.status, 'SUCCEEDED')
    assert.deepEqual(processor.processedJobIds, [job.id])
    assert.isTrue((await worker.runOnce(now.plus({ second: 1 }))) === false)
  })

  test('returns transient failures to pending for two attempts and fails on the third', async ({
    assert,
  }) => {
    const job = await createJob()
    const worker = new ProcessingWorker({
      jobs: new ProcessingJobService(),
      processor: failingProcessor(new ProcessingFailure('PROCESSING_FAILED', true)),
      storage: new MemoryStorage(),
    })
    const now = DateTime.utc()

    await worker.runOnce(now)
    await job.refresh()
    assert.equal(job.status, 'PENDING')
    assert.equal(job.attempts, 1)

    await worker.runOnce(now.plus({ seconds: 1 }))
    await job.refresh()
    assert.equal(job.status, 'PENDING')
    assert.equal(job.attempts, 2)

    await worker.runOnce(now.plus({ seconds: 2 }))
    await job.refresh()
    assert.equal(job.status, 'FAILED')
    assert.equal(job.attempts, 3)
    assert.equal(job.lastErrorCode, 'PROCESSING_ERROR')
  })

  test('marks a deterministic processing failure failed without retrying', async ({ assert }) => {
    const job = await createJob()
    const worker = new ProcessingWorker({
      jobs: new ProcessingJobService(),
      processor: failingProcessor(new ProcessingFailure('PDF_PAGE_LIMIT_EXCEEDED', false)),
      storage: new MemoryStorage(),
    })

    assert.isTrue(await worker.runOnce(DateTime.utc()))
    await job.refresh()
    const material = await Material.findOrFail(job.materialId)
    assert.equal(job.status, 'FAILED')
    assert.equal(job.attempts, 1)
    assert.equal(job.lastErrorCode, 'PDF_PAGE_LIMIT_EXCEEDED')
    assert.equal(material.processingStatus, 'FAILED')
    assert.equal(material.processingErrorCode, 'PDF_PAGE_LIMIT_EXCEEDED')
  })

  test('retains only failed pending cleanup keys and retries terminal cleanup without rerendering', async ({
    assert,
  }) => {
    const job = await createJob({ status: 'SUCCEEDED', attempts: 1 })
    job.merge({
      outputPrefix: 'derivatives/abandoned/',
      pendingCleanupKeys: ['derivatives/old-a.webp', 'derivatives/old-b.webp'],
    })
    await job.save()
    const storage = new MemoryStorage([
      'derivatives/old-a.webp',
      'derivatives/old-b.webp',
      'derivatives/abandoned/preview.webp',
    ])
    storage.failKey = 'derivatives/old-b.webp'
    const processor = succeedingProcessor()
    const worker = new ProcessingWorker({ jobs: new ProcessingJobService(), processor, storage })
    const now = DateTime.utc()

    assert.isTrue(await worker.runOnce(now))
    await job.refresh()
    assert.equal(job.status, 'SUCCEEDED')
    assert.deepEqual(job.pendingCleanupKeys, ['derivatives/old-b.webp'])
    assert.deepEqual(processor.processedJobIds, [])
    assert.isFalse(storage.keys.has('derivatives/old-a.webp'))
    assert.isTrue(storage.keys.has('derivatives/abandoned/preview.webp'))

    storage.failKey = undefined
    assert.isTrue(await worker.runOnce(now.plus({ second: 1 })))
    await job.refresh()
    assert.equal(job.status, 'SUCCEEDED')
    assert.isNull(job.pendingCleanupKeys)
    assert.deepEqual(processor.processedJobIds, [])
    assert.isFalse(storage.keys.has('derivatives/abandoned/preview.webp'))
  })

  test('processes a pending job before retrying a failed cleanup task that is not due', async ({
    assert,
  }) => {
    const job = await createJob()
    await StorageCleanupTask.create({
      storagePrefixes: [],
      objectKeys: ['derivatives/deleted-material/orphan.webp'],
    })
    const processor = succeedingProcessor()
    const storage = new MemoryStorage(['derivatives/deleted-material/orphan.webp'])
    storage.failKey = 'derivatives/deleted-material/orphan.webp'
    const worker = new ProcessingWorker({ jobs: new ProcessingJobService(), processor, storage })
    const now = DateTime.utc()

    assert.isTrue(await worker.runOnce(now))
    await job.refresh()
    assert.equal(job.status, 'PENDING')
    const cleanupTask = await StorageCleanupTask.query().firstOrFail()
    assert.equal(cleanupTask.attempts, 1)
    assert.isAbove(cleanupTask.nextAttemptAt.toMillis(), now.plus({ seconds: 1 }).toMillis())

    assert.isTrue(await worker.runOnce(now.plus({ seconds: 1 })))
    await job.refresh()
    assert.equal(job.status, 'SUCCEEDED')
    assert.deepEqual(processor.processedJobIds, [job.id])
  })
})

async function createJob(
  overrides: Partial<Pick<ProcessingJob, 'status' | 'attempts'>> = {}
): Promise<ProcessingJob> {
  const course = await Course.create({ title: 'Worker course' })
  const module = await CourseModule.create({
    courseId: course.id,
    title: 'Worker module',
    position: 0,
  })
  const material = await Material.create({
    moduleId: module.id,
    title: 'Worker material',
    type: 'IMAGE',
    storageKey: 'originals/worker-material',
    originalFilename: 'worker.png',
    mimeType: 'image/png',
    size: 10,
    position: 0,
    processingStatus: 'PROCESSING',
  })
  return ProcessingJob.create({
    materialId: material.id,
    kind: 'IMAGE_DERIVATIVE',
    status: overrides.status ?? 'PENDING',
    attempts: overrides.attempts ?? 0,
    maxAttempts: 3,
  })
}

function succeedingProcessor() {
  return {
    processedJobIds: [] as number[],
    async process(jobId: number) {
      this.processedJobIds.push(jobId)
      await ProcessingJob.query().where('id', jobId).update({ status: 'SUCCEEDED' })
    },
  }
}

function failingProcessor(error: Error) {
  return {
    async process() {
      throw error
    },
  }
}

class MemoryStorage implements StorageService {
  readonly keys: Set<string>
  failKey: string | undefined

  constructor(keys: string[] = []) {
    this.keys = new Set(keys)
  }

  async ensurePrivateBucket() {}
  async putObject(_input: PutObjectInput) {}
  async getObject(_key: string): Promise<Readable> {
    throw new Error('Not implemented')
  }
  async createTemporaryDownloadUrl() {
    return {
      url: 'https://storage.test/materials/temporary-download',
      expiresAt: '2026-09-06T12:05:00.000Z',
    }
  }
  async listKeys(prefix: string) {
    return [...this.keys].filter((key) => key.startsWith(prefix))
  }
  async deleteObject(key: string) {
    if (key === this.failKey) {
      throw new Error('Object store unavailable')
    }
    this.keys.delete(key)
  }
  async exists(key: string) {
    return this.keys.has(key)
  }
}
