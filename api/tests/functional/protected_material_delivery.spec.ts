import AccessLog from '#models/access_log'
import AccessRule from '#models/access_rule'
import Course from '#models/course'
import CourseModule from '#models/course_module'
import Material from '#models/material'
import MaterialDerivative from '#models/material_derivative'
import ImageTileManifest from '#models/image_tile_manifest'
import User from '#models/user'
import AccessLogService from '#services/access_log_service'
import MinioStorageProvider from '#services/minio_storage_provider'
import ProtectedWatermarkService from '#services/protected_watermark_service'
import testUtils from '@adonisjs/core/services/test_utils'
import type { ApiClient, ApiResponse } from '@japa/api-client'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { Readable } from 'node:stream'
import sharp from 'sharp'
import {
  bootstrapCsrf,
  csrfSessionFrom,
  postLogin,
  withCsrf,
  type CsrfSession,
} from '../helpers/csrf.js'

const password = 'protected-delivery-password'

test.group('Protected material delivery', (group) => {
  let cleanupDatabase: () => Promise<void>
  let student: User
  let module: CourseModule
  let session: CsrfSession
  let originalGetObject: MinioStorageProvider['getObject']
  let originalCreateUrl: MinioStorageProvider['createTemporaryDownloadUrl']
  let originalRecord: AccessLogService['record']
  let originalWatermarkApply: ProtectedWatermarkService['apply']
  let objects: Map<string, Buffer>
  let signedInputs: Array<{ key: string; filename: string; expiresInSeconds: 300 }>

  group.each.setup(async () => {
    cleanupDatabase = await testUtils.db().truncate()
    await cleanupDatabase()
    const course = await Course.create({ title: 'Delivery course' })
    module = await CourseModule.create({
      courseId: course.id,
      title: 'Delivery module',
      position: 0,
    })
    student = await User.create({
      email: `delivery-${Math.random()}@example.test`,
      password,
      role: 'STUDENT',
      status: 'ACTIVE',
    })
    originalGetObject = MinioStorageProvider.prototype.getObject
    originalCreateUrl = MinioStorageProvider.prototype.createTemporaryDownloadUrl
    originalRecord = AccessLogService.prototype.record
    originalWatermarkApply = ProtectedWatermarkService.prototype.apply
    objects = new Map()
    signedInputs = []
    MinioStorageProvider.prototype.getObject = async function (key: string) {
      const body = objects.get(key)
      if (!body) throw new Error(`S3 NoSuchKey secret=${key}`)
      return Readable.from(body)
    }
    MinioStorageProvider.prototype.createTemporaryDownloadUrl = async function (input) {
      signedInputs.push(input)
      return {
        url: 'https://signed.invalid/temporary-original',
        expiresAt: '2026-09-06T12:05:00.000Z',
      }
    }
  })

  group.each.teardown(async () => {
    MinioStorageProvider.prototype.getObject = originalGetObject
    MinioStorageProvider.prototype.createTemporaryDownloadUrl = originalCreateUrl
    AccessLogService.prototype.record = originalRecord
    ProtectedWatermarkService.prototype.apply = originalWatermarkApply
    await cleanupDatabase()
  })

  for (const scope of ['MODULE', 'MATERIAL'] as const) {
    test(`enforces enrollment windows for catalog and PDF IMAGE ZIP delivery with ${scope} exceptions`, async ({
      assert,
      client,
    }) => {
      await Course.query().where('id', module.courseId).update({ status: 'PUBLISHED' })
      session = await login(client, student)
      const pdf = await createMaterial(module.id, 'PDF', 'READY')
      const image = await createMaterial(module.id, 'IMAGE', 'READY')
      const zip = await createMaterial(module.id, 'ZIP', 'READY')
      const page = await createDerivative(pdf.id, 'PDF_PAGE', 'enrollment/page.webp')
      const preview = await createDerivative(image.id, 'IMAGE_PREVIEW', 'enrollment/preview.webp')
      objects.set(page.storageKey, await webp(1200, 1600))
      objects.set(preview.storageKey, await webp(1200, 1600))
      await ImageTileManifest.create({
        materialId: image.id,
        storagePrefix: 'enrollment/image/',
        width: 256,
        height: 256,
        tileSize: 256,
        minLevel: 0,
        maxLevel: 0,
      })
      objects.set('enrollment/image/tiles/0/0/0.webp', await webp(256, 256))
      for (const resourceId of scope === 'MODULE' ? [module.id] : [pdf.id, image.id, zip.id]) {
        await AccessRule.create({
          userId: student.id,
          resourceType: scope,
          resourceId,
          capability: 'VIEW',
          effect: 'ALLOW',
        })
      }
      // Read-only exceptions retain the ZIP download fallback, but cannot cross the course window.
      for (const phase of ['scheduled', 'active', 'expired'] as const) {
        const now = DateTime.utc()
        const startsAt = phase === 'scheduled' ? now.plus({ days: 1 }) : now.minus({ days: 2 })
        const expiresAt = phase === 'expired' ? now.minus({ days: 1 }) : now.plus({ days: 2 })
        for (const capability of ['VIEW', 'DOWNLOAD'] as const) {
          await AccessRule.updateOrCreate(
            { userId: student.id, resourceType: 'COURSE', resourceId: module.courseId, capability },
            { effect: 'DENY', startsAt, expiresAt }
          )
        }
        const active = phase === 'active'
        const list = await authenticatedGet(client, '/api/v1/student/courses', session)
        list.assertStatus(200)
        assert.lengthOf(list.body().data, active ? 1 : 0)
        const detail = await authenticatedGet(
          client,
          `/api/v1/student/courses/${module.courseId}`,
          session
        )
        detail.assertStatus(active ? 200 : 404)
        for (const material of [pdf, image, zip]) {
          const view = await authenticatedGet(
            client,
            `/api/v1/materials/${material.id}/view`,
            session
          )
          view.assertStatus(active ? 200 : 403)
          const download = await withCsrf(
            client.post(`/api/v1/materials/${material.id}/download-url`),
            session
          )
          download.assertStatus(active && material.type === 'ZIP' ? 200 : 403)
        }
        for (const path of [
          `/api/v1/materials/${pdf.id}/derivatives/${page.id}`,
          `/api/v1/materials/${image.id}/derivatives/${preview.id}`,
          `/api/v1/materials/${image.id}/tiles/manifest`,
          `/api/v1/materials/${image.id}/tiles/0/0/0`,
        ]) {
          const response = await authenticatedGet(client, path, session)
          response.assertStatus(active ? 200 : 403)
        }
      }
      assert.lengthOf(signedInputs, 1)
      for (const resourceId of scope === 'MODULE' ? [module.id] : [pdf.id, image.id, zip.id]) {
        await AccessRule.create({
          userId: student.id,
          resourceType: scope,
          resourceId,
          capability: 'DOWNLOAD',
          effect: 'ALLOW',
        })
      }
      for (const phase of ['scheduled', 'active', 'expired'] as const) {
        const now = DateTime.utc()
        await AccessRule.query()
          .where({ userId: student.id, resourceType: 'COURSE', resourceId: module.courseId })
          .update({
            startsAt: phase === 'scheduled' ? now.plus({ days: 1 }) : now.minus({ days: 2 }),
            expiresAt: phase === 'expired' ? now.minus({ days: 1 }) : now.plus({ days: 2 }),
          })
        for (const material of [pdf, image, zip]) {
          const download = await withCsrf(
            client.post(`/api/v1/materials/${material.id}/download-url`),
            session
          )
          download.assertStatus(phase === 'active' ? 200 : 403)
        }
      }
      assert.lengthOf(signedInputs, 4)
    })
  }

  test('requires web authentication for all delivery routes', async ({ client }) => {
    const material = await createMaterial(module.id, 'PDF', 'READY')
    const page = await createDerivative(material.id, 'PDF_PAGE', 'private/page.webp')

    const view = await client.get(`/api/v1/materials/${material.id}/view`)
    view.assertStatus(401)
    const derivative = await client.get(`/api/v1/materials/${material.id}/derivatives/${page.id}`)
    derivative.assertStatus(401)
    const tileManifest = await client.get(`/api/v1/materials/${material.id}/tiles/manifest`)
    tileManifest.assertStatus(401)
    const tile = await client.get(`/api/v1/materials/${material.id}/tiles/0/0/0`)
    tile.assertStatus(401)
    const csrf = await bootstrapCsrf(client)
    const download = await withCsrf(
      client.post(`/api/v1/materials/${material.id}/download-url`),
      csrf
    )
    download.assertStatus(401)
  })

  test('serves safe PDF and IMAGE manifests and protected derivative bytes with VIEW', async ({
    assert,
    client,
  }) => {
    session = await login(client, student)
    const pdf = await createMaterial(module.id, 'PDF', 'READY')
    const pdfPage = await createDerivative(pdf.id, 'PDF_PAGE', 'private/pdf-page.webp')
    const image = await createMaterial(module.id, 'IMAGE', 'READY')
    const preview = await createDerivative(image.id, 'IMAGE_PREVIEW', 'private/image-preview.webp')
    const pdfSource = await webp(1200, 1600)
    const previewSource = await webp(1200, 1600)
    objects.set(pdfPage.storageKey, pdfSource)
    objects.set(preview.storageKey, previewSource)
    await allow(student.id, pdf.id, 'VIEW')
    await allow(student.id, image.id, 'VIEW')

    const pdfManifest = await authenticatedGet(client, `/api/v1/materials/${pdf.id}/view`, session)
    pdfManifest.assertStatus(200)
    assert.equal(pdfManifest.body().data.viewer.kind, 'PDF_PAGES')
    assert.notInclude(JSON.stringify(pdfManifest.body()), pdf.storageKey)
    assert.notInclude(JSON.stringify(pdfManifest.body()), pdfPage.storageKey)

    const imageManifest = await authenticatedGet(
      client,
      `/api/v1/materials/${image.id}/view`,
      session
    )
    imageManifest.assertStatus(200)
    assert.equal(imageManifest.body().data.viewer.kind, 'IMAGE_PREVIEW')

    const page = await authenticatedGet(
      client,
      `/api/v1/materials/${pdf.id}/derivatives/${pdfPage.id}`,
      session
    )
    page.assertStatus(200)
    page.assertHeader('content-type', 'image/webp')
    page.assertHeader('content-disposition', 'inline')
    page.assertHeader('cache-control', 'private, no-store')
    const pageBody = Buffer.from(page.body())
    assert.notDeepEqual(pageBody, pdfSource)
    const pageMetadata = await sharp(pageBody).metadata()
    assert.equal(pageMetadata.format, 'webp')
    const viewLogs = await AccessLog.query().where('action', 'VIEW_MATERIAL').orderBy('id', 'asc')
    assert.deepEqual(
      viewLogs.map((log) => ({
        userId: log.userId,
        materialId: log.materialId,
        userAgent: log.userAgent,
      })),
      [pdf.id, image.id].map((materialId) => ({
        userId: student.id,
        materialId,
        userAgent: 'protected-delivery-test',
      }))
    )
  })

  test('serves a safe tiled manifest and watermarked no-store tile while VIEW remains granted', async ({
    assert,
    client,
  }) => {
    session = await login(client, student)
    const material = await createMaterial(module.id, 'IMAGE', 'READY')
    const prefix = `derivatives/${material.id}/private-run/`
    await ImageTileManifest.create({
      materialId: material.id,
      storagePrefix: prefix,
      width: 257,
      height: 256,
      tileSize: 256,
      minLevel: 0,
      maxLevel: 8,
    })
    const tileKey = `${prefix}tiles/8/1/0.webp`
    const secondTileKey = `${prefix}tiles/8/0/0.webp`
    const source = await webp(1, 256)
    objects.set(tileKey, source)
    objects.set(secondTileKey, await webp(256, 256))
    const viewRule = await allow(student.id, material.id, 'VIEW')

    const view = await authenticatedGet(client, `/api/v1/materials/${material.id}/view`, session)
    view.assertStatus(200)
    assert.deepEqual(view.body().data.viewer, {
      kind: 'IMAGE_TILES',
      manifestUrl: `http://localhost:3333/api/v1/materials/${material.id}/tiles/manifest`,
    })

    const manifest = await authenticatedGet(
      client,
      `/api/v1/materials/${material.id}/tiles/manifest`,
      session
    )
    manifest.assertStatus(200)
    manifest.assertHeader('cache-control', 'private, no-store')
    assert.deepEqual(manifest.body().data, {
      width: 257,
      height: 256,
      tileSize: 256,
      minLevel: 0,
      maxLevel: 8,
      tileUrlTemplate: `http://localhost:3333/api/v1/materials/${material.id}/tiles/{level}/{column}/{row}`,
    })
    assert.notInclude(JSON.stringify(manifest.body()), prefix)
    assert.notInclude(JSON.stringify(manifest.body()), tileKey)

    const tile = await authenticatedGet(
      client,
      `/api/v1/materials/${material.id}/tiles/8/1/0`,
      session
    )
    tile.assertStatus(200)
    tile.assertHeader('content-type', 'image/webp')
    tile.assertHeader('content-disposition', 'inline')
    tile.assertHeader('cache-control', 'private, no-store')
    const tileBody = Buffer.from(tile.body())
    assert.notDeepEqual(tileBody, source)
    const tileMetadata = await sharp(tileBody).metadata()
    assert.equal(tileMetadata.format, 'webp')
    const sourcePixels = await sharp(source).raw().toBuffer()
    const tilePixels = await sharp(tileBody).raw().toBuffer()
    const changedChannels = tilePixels.reduce(
      (count, channel, index) => count + (channel !== sourcePixels[index] ? 1 : 0),
      0
    )
    assert.isAtLeast(changedChannels, 128)
    assert.lengthOf(await AccessLog.query().where('action', 'VIEW_MATERIAL'), 1)

    const secondTile = await authenticatedGet(
      client,
      `/api/v1/materials/${material.id}/tiles/8/0/0`,
      session
    )
    secondTile.assertStatus(200)
    assert.lengthOf(await AccessLog.query().where('action', 'VIEW_MATERIAL'), 1)

    await viewRule.delete()
    const revoked = await authenticatedGet(
      client,
      `/api/v1/materials/${material.id}/tiles/8/1/0`,
      session
    )
    revoked.assertStatus(403)
    assert.notInclude(revoked.text(), tileKey)
    assert.notInclude(revoked.text(), prefix)
    assert.lengthOf(await AccessLog.query().where('action', 'FAILED_ACCESS'), 1)
  })

  test('returns a generic error without raw bytes when watermark composition fails', async ({
    assert,
    client,
  }) => {
    session = await login(client, student)
    const material = await createMaterial(module.id, 'PDF', 'READY')
    const page = await createDerivative(material.id, 'PDF_PAGE', 'private/no-raw-fallback.webp')
    const source = await webp(1200, 1600)
    objects.set(page.storageKey, source)
    await allow(student.id, material.id, 'VIEW')
    ProtectedWatermarkService.prototype.apply = async function () {
      throw new Error('forced watermark failure secret')
    }

    const response = await authenticatedGet(
      client,
      `/api/v1/materials/${material.id}/derivatives/${page.id}`,
      session
    )

    response.assertStatus(500)
    response.assertHeader('content-type', 'application/json; charset=utf-8')
    assert.equal(response.body().message, 'Unable to deliver protected material')
    assert.notInclude(response.text(), 'forced watermark failure secret')
    assert.notInclude(response.text(), source.toString('base64'))
  })

  test('returns a generic error without raw tile bytes when tile watermarking fails', async ({
    assert,
    client,
  }) => {
    session = await login(client, student)
    const material = await createMaterial(module.id, 'IMAGE', 'READY')
    const prefix = `derivatives/${material.id}/watermark-failure/`
    await ImageTileManifest.create({
      materialId: material.id,
      storagePrefix: prefix,
      width: 1,
      height: 1,
      tileSize: 256,
      minLevel: 0,
      maxLevel: 0,
    })
    const source = await webp(1, 1)
    objects.set(`${prefix}tiles/0/0/0.webp`, source)
    await allow(student.id, material.id, 'VIEW')
    ProtectedWatermarkService.prototype.apply = async function () {
      throw new Error('forced tile watermark failure secret')
    }

    const response = await authenticatedGet(
      client,
      `/api/v1/materials/${material.id}/tiles/0/0/0`,
      session
    )

    response.assertStatus(500)
    response.assertHeader('content-type', 'application/json; charset=utf-8')
    assert.equal(response.body().message, 'Unable to deliver protected material')
    assert.notInclude(response.text(), 'forced tile watermark failure secret')
    assert.notInclude(response.text(), source.toString('base64'))
  })

  test('keeps VIEW and DOWNLOAD independent, including after VIEW is revoked', async ({
    assert,
    client,
  }) => {
    session = await login(client, student)
    const material = await createMaterial(module.id, 'PDF', 'READY')
    const page = await createDerivative(material.id, 'PDF_PAGE', 'private/revoked-page.webp')
    objects.set(page.storageKey, Buffer.from('must-not-leak'))
    const viewRule = await allow(student.id, material.id, 'VIEW')

    const manifest = await authenticatedGet(
      client,
      `/api/v1/materials/${material.id}/view`,
      session
    )
    manifest.assertStatus(200)
    assert.isFalse(manifest.body().data.download.allowed)

    const deniedDownload = await withCsrf(
      client.post(`/api/v1/materials/${material.id}/download-url`),
      session
    )
    deniedDownload.assertStatus(403)
    assert.lengthOf(signedInputs, 0)

    await viewRule.delete()
    const stalePage = await authenticatedGet(
      client,
      `/api/v1/materials/${material.id}/derivatives/${page.id}`,
      session
    )
    stalePage.assertStatus(403)
    assert.notInclude(stalePage.text(), 'must-not-leak')

    await allow(student.id, material.id, 'DOWNLOAD')
    const download = await withCsrf(
      client.post(`/api/v1/materials/${material.id}/download-url`),
      session
    )
    download.assertStatus(200)
    assert.equal(signedInputs[0].expiresInSeconds, 300)
    assert.equal(signedInputs[0].key, material.storageKey)
    assert.notInclude(JSON.stringify(download.body()), material.storageKey)

    const stillDeniedView = await authenticatedGet(
      client,
      `/api/v1/materials/${material.id}/view`,
      session
    )
    stillDeniedView.assertStatus(403)
    assert.lengthOf(await AccessLog.query().where('action', 'FAILED_ACCESS'), 3)
    assert.lengthOf(await AccessLog.query().where('action', 'DOWNLOAD_MATERIAL'), 1)
  })

  test('returns ZIP without a viewer and controlled unavailable/not-found outcomes', async ({
    assert,
    client,
  }) => {
    session = await login(client, student)
    const zip = await createMaterial(module.id, 'ZIP', 'READY')
    const processing = await createMaterial(module.id, 'PDF', 'PROCESSING')
    const missingPreview = await createMaterial(module.id, 'IMAGE', 'READY')
    const otherPdf = await createMaterial(module.id, 'PDF', 'READY')
    const otherPage = await createDerivative(otherPdf.id, 'PDF_PAGE', 'private/other-page.webp')
    for (const material of [zip, processing, missingPreview]) {
      await allow(student.id, material.id, 'VIEW')
    }

    const zipView = await authenticatedGet(client, `/api/v1/materials/${zip.id}/view`, session)
    zipView.assertStatus(200)
    assert.isNull(zipView.body().data.viewer)
    assert.isTrue(zipView.body().data.download.allowed)

    const zipDownload = await withCsrf(
      client.post(`/api/v1/materials/${zip.id}/download-url`),
      session
    )
    zipDownload.assertStatus(200)

    const processingView = await authenticatedGet(
      client,
      `/api/v1/materials/${processing.id}/view`,
      session
    )
    processingView.assertStatus(409)
    const missingPreviewView = await authenticatedGet(
      client,
      `/api/v1/materials/${missingPreview.id}/view`,
      session
    )
    missingPreviewView.assertStatus(409)
    const mismatchedDerivative = await authenticatedGet(
      client,
      `/api/v1/materials/${zip.id}/derivatives/${otherPage.id}`,
      session
    )
    mismatchedDerivative.assertStatus(404)
    const invalidId = await authenticatedGet(client, '/api/v1/materials/not-a-number/view', session)
    invalidId.assertStatus(422)
  })

  test('returns generic errors for storage and audit failures without disclosing internals', async ({
    assert,
    client,
  }) => {
    session = await login(client, student)
    const material = await createMaterial(module.id, 'PDF', 'READY')
    const page = await createDerivative(material.id, 'PDF_PAGE', 'private/do-not-leak.webp')
    await allow(student.id, material.id, 'VIEW')
    await allow(student.id, material.id, 'DOWNLOAD')

    const missingObject = await authenticatedGet(
      client,
      `/api/v1/materials/${material.id}/derivatives/${page.id}`,
      session
    )
    missingObject.assertStatus(500)
    assert.deepEqual(missingObject.body(), { message: 'Unable to deliver protected material' })
    assert.notInclude(missingObject.text(), page.storageKey)
    assert.notInclude(missingObject.text(), 'NoSuchKey')

    MinioStorageProvider.prototype.createTemporaryDownloadUrl = async () => {
      throw new Error(`S3 signing failed for ${material.storageKey}`)
    }
    const failedSign = await withCsrf(
      client.post(`/api/v1/materials/${material.id}/download-url`),
      session
    )
    failedSign.assertStatus(500)
    assert.deepEqual(failedSign.body(), { message: 'Unable to deliver protected material' })
    assert.notInclude(failedSign.text(), material.storageKey)

    let signed = false
    MinioStorageProvider.prototype.createTemporaryDownloadUrl = async () => {
      signed = true
      return {
        url: 'https://signed.invalid/must-not-be-returned',
        expiresAt: '2026-09-06T12:05:00.000Z',
      }
    }
    AccessLogService.prototype.record = async () => {
      throw new Error('audit database is unavailable')
    }
    const failedAudit = await withCsrf(
      client.post(`/api/v1/materials/${material.id}/download-url`),
      session
    )
    failedAudit.assertStatus(500)
    assert.isTrue(signed)
    assert.notInclude(failedAudit.text(), 'must-not-be-returned')
    assert.notInclude(failedAudit.text(), 'audit database')
  })
})

async function authenticatedGet(
  client: ApiClient,
  path: string,
  session: CsrfSession
): Promise<ApiResponse> {
  return client
    .get(path)
    .cookie(session.name, session.value)
    .header('user-agent', 'protected-delivery-test')
}

async function login(client: Parameters<typeof postLogin>[0], user: User) {
  const response = await postLogin(client, { email: user.email, password })
  response.assertStatus(200)
  return csrfSessionFrom(response)
}

function allow(userId: number, materialId: number, capability: 'VIEW' | 'DOWNLOAD') {
  return AccessRule.create({
    userId,
    resourceType: 'MATERIAL',
    resourceId: materialId,
    capability,
    effect: 'ALLOW',
  })
}

async function createMaterial(
  moduleId: number,
  type: 'PDF' | 'IMAGE' | 'ZIP',
  processingStatus: 'READY' | 'PROCESSING'
) {
  return Material.create({
    moduleId,
    title: `${type} delivery material`,
    type,
    storageKey: `originals/private-${Math.random()}`,
    originalFilename: `original-${type.toLowerCase()}.bin`,
    mimeType: 'application/octet-stream',
    size: 20,
    position: Math.floor(Math.random() * 1_000_000),
    processingStatus,
  })
}

function createDerivative(
  materialId: number,
  kind: 'PDF_PAGE' | 'IMAGE_PREVIEW',
  storageKey: string
) {
  return MaterialDerivative.create({
    materialId,
    kind,
    storageKey,
    mimeType: 'image/webp',
    pageNumber: kind === 'PDF_PAGE' ? 1 : null,
    width: 1200,
    height: 1600,
    position: 0,
  })
}

function webp(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: '#ffffff' } })
    .webp()
    .toBuffer()
}
