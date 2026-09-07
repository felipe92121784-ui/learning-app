import Course from '#models/course'
import CourseModule from '#models/course_module'
import Material from '#models/material'
import MaterialDerivative from '#models/material_derivative'
import ImageTileManifest from '#models/image_tile_manifest'
import ProcessingJob from '#models/processing_job'
import MaterialProcessingService, { ProcessingFailure } from '#services/material_processing_service'
import type { ImageRenderResult } from '#services/image_derivative_renderer'
import ProcessingJobService from '#services/processing_job_service'
import ProcessingWorker from '#services/processing_worker'
import MaterialsController from '#controllers/materials_controller'
import MinioStorageProvider from '#services/minio_storage_provider'
import type { StorageService, PutObjectInput } from '#services/storage_service'
import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import { Readable } from 'node:stream'
import { writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

test.group('MaterialProcessingService', (group) => {
  let cleanupDatabase: () => Promise<void>

  group.each.setup(async () => {
    cleanupDatabase = await testUtils.db().truncate()
    await cleanupDatabase()
  })

  group.each.teardown(async () => {
    await cleanupDatabase()
  })

  test('fails deterministically when the private original is missing', async ({ assert }) => {
    const { job } = await createRunningJob('IMAGE')
    const storage = new MemoryStorage()
    const service = processingService(storage, {
      pdfRenderer: pdfRenderer(),
      imageRenderer: imageRenderer(),
    })

    const error = await rejected(() => service.process(job.id, DateTime.utc(), job.claimToken!))

    assert.instanceOf(error, ProcessingFailure)
    assert.equal((error as ProcessingFailure).code, 'ORIGINAL_NOT_FOUND')
    assert.isFalse((error as ProcessingFailure).retryable)
    assert.lengthOf(await MaterialDerivative.query(), 0)
    assert.lengthOf(storage.putKeys, 0)
  })

  test('publishes a tile manifest only after all tile uploads succeed', async ({ assert }) => {
    const { job, material } = await createRunningJob('IMAGE')
    const storage = new MemoryStorage({ 'originals/material': Buffer.from('original') })
    const service = processingService(storage, {
      pdfRenderer: pdfRenderer(),
      imageRenderer: tileImageRenderer(),
    })

    await service.process(job.id, DateTime.utc(), job.claimToken!)

    const manifest = await ImageTileManifest.findByOrFail('material_id', material.id)
    await job.refresh()
    await material.refresh()
    assert.deepEqual(storage.putKeys, [
      `${manifest.storagePrefix}tiles/0/0/0.webp`,
      `${manifest.storagePrefix}tiles/1/0/0.webp`,
    ])
    assert.equal(manifest.width, 4097)
    assert.equal(manifest.height, 257)
    assert.equal(manifest.tileSize, 256)
    assert.equal(manifest.minLevel, 0)
    assert.equal(manifest.maxLevel, 13)
    assert.lengthOf(await MaterialDerivative.query(), 0)
    assert.equal(job.status, 'SUCCEEDED')
    assert.isNull(job.outputPrefix)
    assert.equal(material.processingStatus, 'READY')
  })

  test('leaves a processing material without a manifest when a tile upload fails', async ({
    assert,
  }) => {
    const { job, material } = await createRunningJob('IMAGE')
    const storage = new MemoryStorage({ 'originals/material': Buffer.from('original') })
    storage.failPutAt = 2
    const service = processingService(storage, {
      pdfRenderer: pdfRenderer(),
      imageRenderer: tileImageRenderer(),
    })

    const error = await rejected(() => service.process(job.id, DateTime.utc(), job.claimToken!))

    assert.instanceOf(error, ProcessingFailure)
    assert.equal((error as ProcessingFailure).code, 'PROCESSING_FAILED')
    assert.isTrue((error as ProcessingFailure).retryable)
    assert.isNull(await ImageTileManifest.findBy('material_id', material.id))
    await material.refresh()
    assert.equal(material.processingStatus, 'PROCESSING')
    assert.lengthOf(storage.putKeys, 2)
    assert.deepEqual(storage.deletedKeys, storage.putKeys)
  })

  test('deletes uploaded private keys when a later derivative upload fails', async ({ assert }) => {
    const { job } = await createRunningJob('PDF')
    const storage = new MemoryStorage({ 'originals/material': Buffer.from('original') })
    storage.failPutAt = 2
    const service = processingService(storage, {
      pdfRenderer: pdfRenderer(),
      imageRenderer: imageRenderer(),
    })

    const error = await rejected(() => service.process(job.id, DateTime.utc(), job.claimToken!))

    assert.instanceOf(error, ProcessingFailure)
    assert.equal((error as ProcessingFailure).code, 'PROCESSING_FAILED')
    assert.deepEqual(storage.deletedKeys, storage.putKeys)
    assert.lengthOf(await MaterialDerivative.query(), 0)
    await job.refresh()
    assert.match(job.outputPrefix!, new RegExp(`^derivatives/${job.materialId}/[^/]+/$`))
  })

  test('surfaces an incomplete private-prefix cleanup as a retryable failure', async ({
    assert,
  }) => {
    const { job } = await createRunningJob('PDF')
    const storage = new MemoryStorage({ 'originals/material': Buffer.from('original') })
    storage.failPutAt = 2
    storage.failDeletes = true
    const service = processingService(storage, {
      pdfRenderer: pdfRenderer(),
      imageRenderer: imageRenderer(),
    })

    const error = await rejected(() => service.process(job.id, DateTime.utc(), job.claimToken!))

    assert.instanceOf(error, ProcessingFailure)
    assert.equal((error as ProcessingFailure).code, 'PROCESSING_FAILED')
    assert.isTrue((error as ProcessingFailure).retryable)
    await job.refresh()
    assert.match(job.outputPrefix!, new RegExp(`^derivatives/${job.materialId}/[^/]+/$`))
  })

  test('reclaims a previous running output prefix before assigning a fresh run', async ({
    assert,
  }) => {
    const { job } = await createRunningJob('IMAGE')
    const previousPrefix = `derivatives/${job.materialId}/abandoned/`
    const previousKey = `${previousPrefix}preview.webp`
    job.merge({ outputPrefix: previousPrefix })
    await job.save()
    const storage = new MemoryStorage({
      'originals/material': Buffer.from('original'),
      [previousKey]: Buffer.from('abandoned preview'),
    })
    const service = processingService(storage, {
      pdfRenderer: pdfRenderer(),
      imageRenderer: imageRenderer(),
    })

    await service.process(job.id, DateTime.utc(), job.claimToken!)

    assert.isBelow(
      storage.operations.indexOf(`delete:${previousKey}`),
      storage.operations.indexOf(`put:${storage.putKeys[0]}`)
    )
    assert.isFalse(await storage.exists(previousKey))
  })

  test('retains a previous output prefix and fails retryably when reclamation is incomplete', async ({
    assert,
  }) => {
    const { job } = await createRunningJob('IMAGE')
    const previousPrefix = `derivatives/${job.materialId}/abandoned/`
    const previousKey = `${previousPrefix}preview.webp`
    job.merge({ outputPrefix: previousPrefix })
    await job.save()
    const storage = new MemoryStorage({
      'originals/material': Buffer.from('original'),
      [previousKey]: Buffer.from('abandoned preview'),
    })
    storage.failDeletes = true
    const service = processingService(storage, {
      pdfRenderer: pdfRenderer(),
      imageRenderer: imageRenderer(),
    })

    const error = await rejected(() => service.process(job.id, DateTime.utc(), job.claimToken!))

    assert.instanceOf(error, ProcessingFailure)
    assert.isTrue((error as ProcessingFailure).retryable)
    await job.refresh()
    assert.equal(job.outputPrefix, previousPrefix)
    assert.lengthOf(storage.putKeys, 0)
  })

  test('replaces prior derivative metadata and persists old private keys for post-commit cleanup', async ({
    assert,
  }) => {
    const { job, material } = await createRunningJob('IMAGE')
    const oldKey = `derivatives/${material.id}/previous/preview.webp`
    await MaterialDerivative.create({
      materialId: material.id,
      kind: 'IMAGE_PREVIEW',
      storageKey: oldKey,
      mimeType: 'image/webp',
      pageNumber: null,
      width: 1,
      height: 1,
      position: 0,
    })
    const storage = new MemoryStorage({
      'originals/material': Buffer.from('original'),
      [oldKey]: Buffer.from('old preview'),
    })
    const service = processingService(storage, {
      pdfRenderer: pdfRenderer(),
      imageRenderer: imageRenderer(),
    })

    await service.process(job.id, DateTime.utc(), job.claimToken!)

    const derivatives = await MaterialDerivative.query().where('material_id', material.id)
    assert.lengthOf(derivatives, 1)
    assert.notEqual(derivatives[0].storageKey, oldKey)
    assert.isTrue(await storage.exists(oldKey))
    assert.isTrue(await storage.exists(derivatives[0].storageKey))
    await job.refresh()
    assert.deepEqual(job.pendingCleanupKeys, [oldKey])
    assert.notInclude(storage.deletedKeys, oldKey)
  })

  test('reprocess schedules the former tile prefix for cleanup without queuing every tile key', async ({
    assert,
  }) => {
    const { job, material } = await createRunningJob('IMAGE')
    const oldPrefix = `derivatives/${material.id}/old-tiles/`
    const oldTileKeys = [`${oldPrefix}tiles/0/0/0.webp`, `${oldPrefix}tiles/1/0/0.webp`]
    await ImageTileManifest.create({
      materialId: material.id,
      storagePrefix: oldPrefix,
      width: 4097,
      height: 257,
      tileSize: 256,
      minLevel: 0,
      maxLevel: 13,
    })
    const storage = new MemoryStorage({
      'originals/material': Buffer.from('original'),
      [oldTileKeys[0]]: Buffer.from('old tile one'),
      [oldTileKeys[1]]: Buffer.from('old tile two'),
    })
    const service = processingService(storage, {
      pdfRenderer: pdfRenderer(),
      imageRenderer: imageRenderer(),
    })

    const now = DateTime.utc()
    await service.process(job.id, now, job.claimToken!)

    assert.isNull(await ImageTileManifest.findBy('material_id', material.id))
    await job.refresh()
    assert.equal(job.outputPrefix, oldPrefix)
    assert.isNull(job.pendingCleanupKeys)

    const worker = new ProcessingWorker({
      jobs: new ProcessingJobService(),
      processor: service,
      storage,
    })
    assert.isTrue(await worker.runOnce(now.plus({ seconds: 1 })))
    await job.refresh()
    assert.isNull(job.outputPrefix)
    assert.isFalse(await storage.exists(oldTileKeys[0]))
    assert.isFalse(await storage.exists(oldTileKeys[1]))
  })

  test('tolerates a missing prior derivative object while replacing its metadata', async ({
    assert,
  }) => {
    const { job, material } = await createRunningJob('IMAGE')
    const oldKey = `derivatives/${material.id}/missing/preview.webp`
    await MaterialDerivative.create({
      materialId: material.id,
      kind: 'IMAGE_PREVIEW',
      storageKey: oldKey,
      mimeType: 'image/webp',
      pageNumber: null,
      width: 1,
      height: 1,
      position: 0,
    })
    const storage = new MemoryStorage({ 'originals/material': Buffer.from('original') })
    storage.missingDeletesThrow = true
    const service = processingService(storage, {
      pdfRenderer: pdfRenderer(),
      imageRenderer: imageRenderer(),
    })

    await service.process(job.id, DateTime.utc(), job.claimToken!)

    const derivatives = await MaterialDerivative.query().where('material_id', material.id)
    assert.lengthOf(derivatives, 1)
    assert.notEqual(derivatives[0].storageKey, oldKey)
    await job.refresh()
    assert.deepEqual(job.pendingCleanupKeys, [oldKey])
  })

  test('keeps old metadata and its private object intact when replacement writes roll back', async ({
    assert,
  }) => {
    const { job, material } = await createRunningJob('IMAGE')
    const oldKey = `derivatives/${material.id}/previous/preview.webp`
    await MaterialDerivative.create({
      materialId: material.id,
      kind: 'IMAGE_PREVIEW',
      storageKey: oldKey,
      mimeType: 'image/webp',
      pageNumber: null,
      width: 1,
      height: 1,
      position: 0,
    })
    const storage = new MemoryStorage({
      'originals/material': Buffer.from('original'),
      [oldKey]: Buffer.from('old preview'),
    })
    const service = processingService(storage, {
      pdfRenderer: pdfRenderer(),
      imageRenderer: imageRenderer({ width: 0 }),
    })

    await rejected(() => service.process(job.id, DateTime.utc(), job.claimToken!))

    const [derivative] = await MaterialDerivative.query().where('material_id', material.id)
    assert.equal(derivative.storageKey, oldKey)
    assert.isTrue(await storage.exists(oldKey))
    await job.refresh()
    assert.isNull(job.pendingCleanupKeys)
  })

  test('uses the controller lifecycle transaction when deletion wins the material lock', async ({
    assert,
  }) => {
    const { job, material, module } = await createRunningJob('IMAGE')
    const storage = new MemoryStorage({ 'originals/material': Buffer.from('original') })
    const service = processingService(storage, {
      pdfRenderer: pdfRenderer(),
      imageRenderer: imageRenderer(),
    })
    const originalDeleteObject = MinioStorageProvider.prototype.deleteObject
    let signalDeletionLock!: () => void
    let releaseDeletion!: () => void
    const deletionLocked = new Promise<void>((resolve) => (signalDeletionLock = resolve))
    const continueDeletion = new Promise<void>((resolve) => (releaseDeletion = resolve))
    MinioStorageProvider.prototype.deleteObject = async (key) => {
      if (key === material.storageKey) {
        signalDeletionLock()
        await continueDeletion
      }
    }

    try {
      const response = controllerResponse()
      const deletion = new MaterialsController().destroy({
        params: { moduleId: String(module.id), id: String(material.id) },
        response,
        logger: { error: () => undefined },
      } as never)
      await deletionLocked
      const processing = rejected(() => service.process(job.id, DateTime.utc(), job.claimToken!))
      const blocked = await Promise.race([
        processing.then(() => 'settled'),
        new Promise<'blocked'>((resolve) => setTimeout(() => resolve('blocked'), 50)),
      ])
      assert.equal(blocked, 'blocked')

      releaseDeletion()
      await deletion
      const error = await processing
      assert.instanceOf(error, ProcessingFailure)
      assert.equal((error as ProcessingFailure).code, 'PROCESSING_FAILED')
      assert.deepEqual(storage.deletedKeys, storage.putKeys)
      assert.isNull(await Material.find(material.id))
      assert.lengthOf(await MaterialDerivative.query().where('material_id', material.id), 0)
    } finally {
      MinioStorageProvider.prototype.deleteObject = originalDeleteObject
    }
  })

  test('marks a running job succeeded only after private derivative metadata is written', async ({
    assert,
  }) => {
    const { job, material } = await createRunningJob('IMAGE')
    const storage = new MemoryStorage({ 'originals/material': Buffer.from('original') })
    const service = processingService(storage, {
      pdfRenderer: pdfRenderer(),
      imageRenderer: imageRenderer(),
    })

    await service.process(job.id, DateTime.utc(), job.claimToken!)

    await job.refresh()
    await material.refresh()
    const [derivative] = await MaterialDerivative.query().where('material_id', material.id)
    assert.equal(job.status, 'SUCCEEDED')
    assert.equal(material.processingStatus, 'READY')
    assert.isNull(material.processingErrorCode)
    assert.notProperty(job.serialize(), 'outputPrefix')
    assert.notProperty(job.serialize(), 'pendingCleanupKeys')
    assert.match(
      storage.putKeys[0],
      new RegExp(`^derivatives/${material.id}/[^/]+/preview\\.webp$`)
    )
    assert.notProperty(derivative.serialize(), 'storageKey')
    assert.notInclude(JSON.stringify(derivative.serialize()), 'derivatives/')
  })

  test('rejects a stale worker after its lease is reclaimed by a new fencing token', async ({
    assert,
  }) => {
    const { job, material } = await createRunningJob('IMAGE')
    const now = DateTime.utc()
    job.merge({ status: 'PENDING', lockedAt: null, leaseExpiresAt: null })
    await job.save()
    const jobs = new ProcessingJobService()

    const renderer = blockingImageRenderer()
    const storage = new MemoryStorage({ 'originals/material': Buffer.from('original') })
    const service = processingService(storage, {
      pdfRenderer: pdfRenderer(),
      imageRenderer: renderer.imageRenderer,
    })
    const firstWorker = new ProcessingWorker({
      jobs,
      processor: service,
      storage,
    })
    const firstRun = firstWorker.runOnce(now)

    await renderer.started
    await job.refresh()
    const firstToken = job.claimToken
    assert.isString(firstToken)
    await ProcessingJob.query()
      .where('id', job.id)
      .update({ lease_expires_at: now.minus({ minute: 1 }).toSQL() })
    const secondClaim = await jobs.claimNext(now.plus({ minutes: 6 }))
    assert.isNotNull(secondClaim)
    const secondToken = (secondClaim as unknown as { claimToken: string }).claimToken
    assert.notEqual(firstToken, secondToken)

    renderer.release()
    assert.isTrue(await firstRun)
    await job.refresh()
    assert.equal(job.status, 'RUNNING')
    assert.equal((job as unknown as { claimToken: string | null }).claimToken, secondToken)
    await material.refresh()
    assert.equal(material.processingStatus, 'PROCESSING')
    assert.isNull(material.processingErrorCode)
    assert.lengthOf(await MaterialDerivative.query().where('material_id', job.materialId), 0)
  })

  test('does not publish a stale worker success when its guarded update affects zero rows', async ({
    assert,
  }) => {
    const { job, material } = await createRunningJob('IMAGE')
    const now = DateTime.utc()
    job.merge({ status: 'PENDING', lockedAt: null, leaseExpiresAt: null })
    await job.save()
    const jobs = new ProcessingJobService()
    const storage = new MemoryStorage({ 'originals/material': Buffer.from('original') })
    let signalUpload!: () => void
    let releaseUpload!: () => void
    const uploaded = new Promise<void>((resolve) => (signalUpload = resolve))
    const continueUpload = new Promise<void>((resolve) => (releaseUpload = resolve))
    storage.onPut = async () => {
      signalUpload()
      await continueUpload
    }
    const processor = processingService(storage, {
      pdfRenderer: pdfRenderer(),
      imageRenderer: imageRenderer(),
    })
    const worker = new ProcessingWorker({ jobs, processor, storage })

    const firstRun = worker.runOnce(now)
    await uploaded
    await job.refresh()
    const firstToken = job.claimToken
    await ProcessingJob.query()
      .where('id', job.id)
      .update({ lease_expires_at: now.minus({ minute: 1 }).toSQL() })
    const secondClaim = await jobs.claimNext(now.plus({ minutes: 6 }))
    assert.isNotNull(secondClaim)
    assert.notEqual(firstToken, secondClaim!.claimToken)

    releaseUpload()
    assert.isTrue(await firstRun)
    await job.refresh()
    await material.refresh()
    assert.equal(job.status, 'RUNNING')
    assert.equal(job.claimToken, secondClaim!.claimToken)
    assert.equal(material.processingStatus, 'PROCESSING')
    assert.isNull(material.processingErrorCode)
    assert.lengthOf(await MaterialDerivative.query().where('material_id', job.materialId), 0)
  })
})

class MemoryStorage implements StorageService {
  readonly putKeys: string[] = []
  readonly deletedKeys: string[] = []
  readonly operations: string[] = []
  failPutAt: number | undefined
  failDeletes = false
  missingDeletesThrow = false
  onPut: (() => Promise<void>) | undefined

  constructor(private objects: Record<string, Buffer> = {}) {}

  async ensurePrivateBucket() {}

  async putObject(input: PutObjectInput) {
    this.putKeys.push(input.key)
    this.operations.push(`put:${input.key}`)
    if (this.putKeys.length === this.failPutAt) {
      throw new Error('S3 endpoint unavailable')
    }
    this.objects[input.key] = await readStream(input.body)
    await this.onPut?.()
  }

  async getObject(key: string) {
    const object = this.objects[key]
    if (!object) {
      const error = new Error('missing private key') as Error & { name: string }
      error.name = 'NoSuchKey'
      throw error
    }
    return Readable.from(object)
  }

  async createTemporaryDownloadUrl() {
    return {
      url: 'https://storage.test/materials/temporary-download',
      expiresAt: '2026-09-06T12:05:00.000Z',
    }
  }

  async listKeys(prefix: string) {
    return Object.keys(this.objects).filter((key) => key.startsWith(prefix))
  }

  async deleteObject(key: string) {
    this.deletedKeys.push(key)
    this.operations.push(`delete:${key}`)
    if (this.failDeletes) {
      throw new Error('S3 endpoint unavailable while deleting')
    }
    if (this.missingDeletesThrow && !this.objects[key]) {
      const error = new Error('missing private key') as Error & { name: string }
      error.name = 'NoSuchKey'
      throw error
    }
    delete this.objects[key]
  }

  async exists(key: string) {
    return Boolean(this.objects[key])
  }
}

function processingService(
  storage: StorageService,
  renderers: {
    pdfRenderer: ReturnType<typeof pdfRenderer>
    imageRenderer: {
      render(input: { source: string; outputDirectory: string }): Promise<ImageRenderResult>
    }
  }
) {
  return new MaterialProcessingService({
    storage,
    ...renderers,
  })
}

function controllerResponse() {
  return {
    noContent: () => undefined,
    internalServerError: () => undefined,
  }
}

function imageRenderer(options: { width?: number } = {}) {
  return {
    async render({
      outputDirectory,
    }: {
      source: string
      outputDirectory: string
    }): Promise<Extract<ImageRenderResult, { mode: 'PREVIEW' }>> {
      const path = `${outputDirectory}/preview.webp`
      await writeFile(path, 'webp', { mode: 0o600 })
      return {
        mode: 'PREVIEW',
        artifacts: [
          {
            filename: 'preview.webp',
            path,
            mimeType: 'image/webp',
            width: options.width ?? 10,
            height: 5,
            pageNumber: null,
            position: 0,
          },
        ],
      }
    },
  }
}

function tileImageRenderer(): {
  render(input: {
    source: string
    outputDirectory: string
  }): Promise<Extract<ImageRenderResult, { mode: 'TILES' }>>
} {
  return {
    async render({ outputDirectory }) {
      const firstPath = `${outputDirectory}/tile-0.webp`
      const secondPath = `${outputDirectory}/tile-1.webp`
      await Promise.all([
        writeFile(firstPath, 'tile zero', { mode: 0o600 }),
        writeFile(secondPath, 'tile one', { mode: 0o600 }),
      ])
      return {
        mode: 'TILES' as const,
        manifest: { width: 4097, height: 257, tileSize: 256, minLevel: 0, maxLevel: 13 },
        artifacts: [
          {
            relativeKey: 'tiles/0/0/0.webp',
            path: firstPath,
            mimeType: 'image/webp',
            width: 1,
            height: 1,
          },
          {
            relativeKey: 'tiles/1/0/0.webp',
            path: secondPath,
            mimeType: 'image/webp',
            width: 1,
            height: 1,
          },
        ],
      }
    },
  }
}

function blockingImageRenderer() {
  let signalStarted!: () => void
  let release!: () => void
  const started = new Promise<void>((resolve) => (signalStarted = resolve))
  const released = new Promise<void>((resolve) => (release = resolve))
  const delegate = imageRenderer()
  return {
    started,
    release,
    imageRenderer: {
      async render(input: { source: string; outputDirectory: string }) {
        signalStarted()
        await released
        return delegate.render(input)
      },
    },
  }
}

function pdfRenderer() {
  return {
    async render({ outputDirectory }: { source: string; outputDirectory: string }) {
      const firstPath = `${outputDirectory}/page-1.webp`
      const secondPath = `${outputDirectory}/page-2.webp`
      await Promise.all([
        writeFile(firstPath, 'one', { mode: 0o600 }),
        writeFile(secondPath, 'two', { mode: 0o600 }),
      ])
      return {
        pages: [
          {
            filename: 'page-1.webp',
            path: firstPath,
            mimeType: 'image/webp' as const,
            width: 10,
            height: 5,
            pageNumber: 1,
            position: 0,
          },
          {
            filename: 'page-2.webp',
            path: secondPath,
            mimeType: 'image/webp' as const,
            width: 10,
            height: 5,
            pageNumber: 2,
            position: 1,
          },
        ],
      }
    },
  }
}

async function createRunningJob(type: 'PDF' | 'IMAGE') {
  const course = await Course.create({ title: 'Processing course' })
  const module = await CourseModule.create({
    courseId: course.id,
    title: 'Processing module',
    position: 0,
  })
  const material = await Material.create({
    moduleId: module.id,
    title: 'Private material',
    type,
    storageKey: 'originals/material',
    originalFilename: type === 'PDF' ? 'material.pdf' : 'material.png',
    mimeType: type === 'PDF' ? 'application/pdf' : 'image/png',
    size: 10,
    position: 0,
    processingStatus: 'PROCESSING',
  })
  const job = await ProcessingJob.create({
    materialId: material.id,
    kind: type === 'PDF' ? 'PDF_RENDER' : 'IMAGE_DERIVATIVE',
    status: 'RUNNING',
    attempts: 1,
    maxAttempts: 3,
    claimToken: randomUUID(),
    leaseExpiresAt: DateTime.utc().plus({ minutes: 5 }),
  })
  return { job, material, module }
}

async function readStream(stream: Readable) {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

async function rejected(action: () => Promise<unknown>) {
  try {
    await action()
  } catch (error) {
    return error
  }
  throw new Error('Expected action to reject')
}
