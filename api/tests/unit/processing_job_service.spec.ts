import Course from '#models/course'
import CourseModule from '#models/course_module'
import Material from '#models/material'
import MaterialDerivative from '#models/material_derivative'
import ProcessingJob from '#models/processing_job'
import ProcessingJobService from '#services/processing_job_service'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { test } from '@japa/runner'

test.group('ProcessingJobService', (group) => {
  let cleanupDatabase: () => Promise<void>

  group.each.setup(async () => {
    cleanupDatabase = await testUtils.db().truncate()
    await cleanupDatabase()
  })

  group.each.teardown(async () => {
    await cleanupDatabase()
  })

  test('enqueues one pending PDF render job with a maximum of three attempts', async ({
    assert,
  }) => {
    const material = await createMaterial('PDF')
    const service = new ProcessingJobService()

    const job = await db.transaction((trx) => service.enqueueForMaterial(trx, material))

    assert.isNotNull(job)
    assert.equal(job!.materialId, material.id)
    assert.equal(job!.kind, 'PDF_RENDER')
    assert.equal(job!.status, 'PENDING')
    assert.equal(job!.attempts, 0)
    assert.equal(job!.maxAttempts, 3)
  })

  test('does not enqueue a derivative job for ZIP material', async ({ assert }) => {
    const material = await createMaterial('ZIP')
    const service = new ProcessingJobService()

    const job = await db.transaction((trx) => service.enqueueForMaterial(trx, material))

    assert.isNull(job)
    const [row] = await ProcessingJob.query().where('material_id', material.id).count('* as total')
    assert.equal(Number(row.$extras.total), 0)
  })

  test('keeps one active job when two transactions enqueue the same material', async ({
    assert,
  }) => {
    const material = await createMaterial('IMAGE')
    const service = new ProcessingJobService()

    await Promise.all([
      db.transaction((trx) => service.enqueueForMaterial(trx, material)),
      db.transaction((trx) => service.enqueueForMaterial(trx, material)),
    ])

    const jobs = await ProcessingJob.query().where('material_id', material.id)
    assert.lengthOf(jobs, 1)
    assert.equal(jobs[0].kind, 'IMAGE_DERIVATIVE')
  })

  test('claims one pending job once across concurrent workers', async ({ assert }) => {
    const material = await createMaterial('PDF')
    const job = await ProcessingJob.create({
      materialId: material.id,
      kind: 'PDF_RENDER',
      status: 'PENDING',
      attempts: 0,
      maxAttempts: 3,
    })
    const service = new ProcessingJobService()
    const now = DateTime.utc()

    const [left, right] = await Promise.all([service.claimNext(now), service.claimNext(now)])
    const claims = [left, right].filter((claim) => claim !== null)

    assert.lengthOf(claims, 1)
    assert.equal(claims[0]!.id, job.id)
    assert.equal(claims[0]!.status, 'RUNNING')
    assert.deepEqual(claims[0]!.lockedAt?.toISO(), now.toISO())
    assert.isTrue(claims[0]!.leaseExpiresAt! > now)
  })

  test('rejects a job with attempts above its maximum', async ({ assert }) => {
    const material = await createMaterial('PDF')

    await assert.rejects(() =>
      ProcessingJob.create({
        materialId: material.id,
        kind: 'PDF_RENDER',
        status: 'PENDING',
        attempts: 4,
        maxAttempts: 3,
      })
    )
  })

  test('enforces derivative kind, page, and WebP MIME invariants', async ({ assert }) => {
    const material = await createMaterial('PDF')

    for (const invalidDerivative of [
      { kind: 'PDF_PAGE' as const, pageNumber: null, mimeType: 'image/webp' },
      { kind: 'IMAGE_PREVIEW' as const, pageNumber: 1, mimeType: 'image/webp' },
      { kind: 'PDF_PAGE' as const, pageNumber: 1, mimeType: 'image/png' },
    ]) {
      await assert.rejects(() =>
        MaterialDerivative.create({
          materialId: material.id,
          storageKey: `derivatives/${material.id}/${invalidDerivative.kind}-${invalidDerivative.pageNumber}`,
          width: 100,
          height: 100,
          position: 0,
          ...invalidDerivative,
        })
      )
    }
  })
})

async function createMaterial(type: 'PDF' | 'IMAGE' | 'ZIP') {
  const course = await Course.create({ title: 'Queue course' })
  const module = await CourseModule.create({
    courseId: course.id,
    title: 'Queue module',
    position: 0,
  })

  return Material.create({
    moduleId: module.id,
    title: `${type} material`,
    type,
    storageKey: `originals/${type.toLowerCase()}-material`,
    originalFilename: `material.${type.toLowerCase()}`,
    mimeType: type === 'PDF' ? 'application/pdf' : 'application/octet-stream',
    size: 10,
    position: 0,
    processingStatus: 'PROCESSING',
  })
}
