import Course from '#models/course'
import CourseModule from '#models/course_module'
import Material from '#models/material'
import MaterialDerivative from '#models/material_derivative'
import ProcessingJob from '#models/processing_job'
import MaterialProcessingService, {
  ProcessingFailure,
  type RenderedDerivative,
} from '#services/material_processing_service'
import type { StorageService, PutObjectInput } from '#services/storage_service'
import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import { Readable } from 'node:stream'
import { writeFile } from 'node:fs/promises'

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
    const service = processingService(storage, imageRenderer())

    const error = await assert.rejects(() => service.process(job.id, DateTime.utc()))

    assert.instanceOf(error, ProcessingFailure)
    assert.equal(error.code, 'ORIGINAL_NOT_FOUND')
    assert.isFalse(error.retryable)
    assert.lengthOf(await MaterialDerivative.query(), 0)
    assert.lengthOf(storage.putKeys, 0)
  })

  test('deletes uploaded private keys when a later derivative upload fails', async ({ assert }) => {
    const { job } = await createRunningJob('PDF')
    const storage = new MemoryStorage({ 'originals/material': Buffer.from('original') })
    storage.failPutAt = 2
    const service = processingService(storage, pdfRenderer())

    const error = await assert.rejects(() => service.process(job.id, DateTime.utc()))

    assert.instanceOf(error, ProcessingFailure)
    assert.equal(error.code, 'PROCESSING_FAILED')
    assert.deepEqual(storage.deletedKeys, [storage.putKeys[0]])
    assert.lengthOf(await MaterialDerivative.query(), 0)
  })

  test('cleans the run when deletion wins before derivative metadata is committed', async ({ assert }) => {
    const { job, material } = await createRunningJob('IMAGE')
    const storage = new MemoryStorage({ 'originals/material': Buffer.from('original') })
    storage.onFirstPut = async () => material.delete()
    const service = processingService(storage, imageRenderer())

    const error = await assert.rejects(() => service.process(job.id, DateTime.utc()))

    assert.instanceOf(error, ProcessingFailure)
    assert.equal(error.code, 'PROCESSING_FAILED')
    assert.deepEqual(storage.deletedKeys, storage.putKeys)
    assert.lengthOf(await MaterialDerivative.query(), 0)
  })

  test('marks a running job succeeded only after private derivative metadata is written', async ({ assert }) => {
    const { job, material } = await createRunningJob('IMAGE')
    const storage = new MemoryStorage({ 'originals/material': Buffer.from('original') })
    const service = processingService(storage, imageRenderer())

    await service.process(job.id, DateTime.utc())

    await job.refresh()
    await material.refresh()
    const [derivative] = await MaterialDerivative.query().where('material_id', material.id)
    assert.equal(job.status, 'SUCCEEDED')
    assert.equal(material.processingStatus, 'READY')
    assert.isNull(material.processingErrorCode)
    assert.match(storage.putKeys[0], new RegExp(`^derivatives/${material.id}/[^/]+/preview\\.webp$`))
    assert.notProperty(derivative.serialize(), 'storageKey')
    assert.notInclude(JSON.stringify(derivative.serialize()), 'derivatives/')
  })
})

class MemoryStorage implements StorageService {
  readonly putKeys: string[] = []
  readonly deletedKeys: string[] = []
  failPutAt: number | undefined
  onFirstPut: (() => Promise<void>) | undefined

  constructor(private objects: Record<string, Buffer> = {}) {}

  async ensurePrivateBucket() {}

  async putObject(input: PutObjectInput) {
    this.putKeys.push(input.key)
    if (this.putKeys.length === this.failPutAt) {
      throw new Error('S3 endpoint unavailable')
    }
    this.objects[input.key] = await readStream(input.body)
    if (this.putKeys.length === 1) {
      await this.onFirstPut?.()
    }
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

  async listKeys(prefix: string) {
    return Object.keys(this.objects).filter((key) => key.startsWith(prefix))
  }

  async deleteObject(key: string) {
    this.deletedKeys.push(key)
    delete this.objects[key]
  }

  async exists(key: string) {
    return Boolean(this.objects[key])
  }
}

function processingService(storage: StorageService, renderer: { render: (input: { source: string; outputDirectory: string }) => Promise<RenderedDerivative | { pages: RenderedDerivative[] }> }) {
  return new MaterialProcessingService({
    storage,
    pdfRenderer: renderer,
    imageRenderer: renderer,
  })
}

function imageRenderer() {
  return {
    async render({ outputDirectory }: { source: string; outputDirectory: string }): Promise<RenderedDerivative> {
      const path = `${outputDirectory}/preview.webp`
      await writeFile(path, 'webp', { mode: 0o600 })
      return { filename: 'preview.webp', path, mimeType: 'image/webp', width: 10, height: 5, pageNumber: null, position: 0 }
    },
  }
}

function pdfRenderer() {
  return {
    async render({ outputDirectory }: { source: string; outputDirectory: string }) {
      const firstPath = `${outputDirectory}/page-1.webp`
      const secondPath = `${outputDirectory}/page-2.webp`
      await Promise.all([writeFile(firstPath, 'one', { mode: 0o600 }), writeFile(secondPath, 'two', { mode: 0o600 })])
      return {
        pages: [
          { filename: 'page-1.webp', path: firstPath, mimeType: 'image/webp' as const, width: 10, height: 5, pageNumber: 1, position: 0 },
          { filename: 'page-2.webp', path: secondPath, mimeType: 'image/webp' as const, width: 10, height: 5, pageNumber: 2, position: 1 },
        ],
      }
    },
  }
}

async function createRunningJob(type: 'PDF' | 'IMAGE') {
  const course = await Course.create({ title: 'Processing course' })
  const module = await CourseModule.create({ courseId: course.id, title: 'Processing module', position: 0 })
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
  })
  return { job, material }
}

async function readStream(stream: Readable) {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}
