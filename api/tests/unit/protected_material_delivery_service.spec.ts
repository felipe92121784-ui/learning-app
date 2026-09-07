import Course from '#models/course'
import CourseModule from '#models/course_module'
import Material from '#models/material'
import MaterialDerivative from '#models/material_derivative'
import User from '#models/user'
import ProtectedMaterialsController from '#controllers/protected_materials_controller'
import type { AccessDecision, ResolveAccessInput } from '#services/access_control_service'
import type { CreateAccessLogInput } from '#services/access_log_service'
import ProtectedMaterialDeliveryService, {
  ProtectedMaterialForbiddenError,
  ProtectedMaterialNotFoundError,
  ProtectedMaterialUnavailableError,
} from '#services/protected_material_delivery_service'
import type {
  CreateTemporaryDownloadUrlInput,
  PutObjectInput,
  StorageService,
} from '#services/storage_service'
import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { PassThrough, Readable } from 'node:stream'
import type { HttpContext } from '@adonisjs/core/http'

const now = DateTime.fromISO('2026-09-06T12:00:00.000Z', { zone: 'utc' })

test.group('ProtectedMaterialDeliveryService', (group) => {
  let cleanupDatabase: () => Promise<void>

  group.each.setup(async () => {
    cleanupDatabase = await testUtils.db().truncate()
    await cleanupDatabase()
  })

  group.each.teardown(async () => {
    await cleanupDatabase()
  })

  test('builds a safe PDF manifest and resolves VIEW and DOWNLOAD independently', async ({
    assert,
  }) => {
    const { student, material } = await createHierarchy({ type: 'PDF' })
    const pages = await MaterialDerivative.createMany([
      derivative(material.id, 2, 1, 'private/pages/two.webp'),
      derivative(material.id, 1, 0, 'private/pages/one.webp'),
    ])
    const access = new FakeAccessControl({ VIEW: true, DOWNLOAD: false })
    const logs = new FakeAccessLog()
    const service = makeService(access, logs)

    const manifest = await service.getView(requestFor(student.id, material.id))

    assert.deepEqual(manifest, {
      id: material.id,
      title: material.title,
      type: 'PDF',
      viewer: {
        kind: 'PDF_PAGES',
        derivatives: [
          {
            id: pages[1].id,
            pageNumber: 1,
            width: 1200,
            height: 1600,
            position: 0,
            contentUrl: `http://api.example.test/api/v1/materials/${material.id}/derivatives/${pages[1].id}`,
          },
          {
            id: pages[0].id,
            pageNumber: 2,
            width: 1200,
            height: 1600,
            position: 1,
            contentUrl: `http://api.example.test/api/v1/materials/${material.id}/derivatives/${pages[0].id}`,
          },
        ],
      },
      download: { allowed: false },
    })
    assert.deepEqual(
      access.inputs.map(({ capability }) => capability),
      ['VIEW', 'DOWNLOAD']
    )
    assert.deepEqual(logs.inputs, [
      {
        userId: student.id,
        materialId: material.id,
        action: 'VIEW_MATERIAL',
        ipAddress: '127.0.0.1',
        userAgent: 'unit-test',
      },
    ])
    assert.notInclude(JSON.stringify(manifest), material.storageKey)
    assert.notInclude(JSON.stringify(manifest), 'private/pages')
  })

  test('returns IMAGE and ZIP manifests and rejects unavailable viewer inputs', async ({
    assert,
  }) => {
    const { student, module } = await createHierarchy({ type: 'PDF' })
    const image = await createMaterial(module.id, 'IMAGE', 'READY')
    const preview = await MaterialDerivative.create({
      ...derivative(image.id, null, 0, 'private/previews/image.webp'),
      kind: 'IMAGE_PREVIEW',
    })
    const zip = await createMaterial(module.id, 'ZIP', 'READY')
    const processing = await createMaterial(module.id, 'PDF', 'PROCESSING')
    const missingDerivative = await createMaterial(module.id, 'IMAGE', 'READY')
    const service = makeService(
      new FakeAccessControl({ VIEW: true, DOWNLOAD: true }),
      new FakeAccessLog()
    )

    const imageView = await service.getView(requestFor(student.id, image.id))
    assert.equal(imageView.viewer?.kind, 'IMAGE_PREVIEW')
    assert.equal(imageView.viewer?.derivatives[0].id, preview.id)
    assert.deepEqual(await service.getView(requestFor(student.id, zip.id)), {
      id: zip.id,
      title: zip.title,
      type: 'ZIP',
      viewer: null,
      download: { allowed: true },
    })
    await assert.rejects(
      () => service.getView(requestFor(student.id, processing.id)),
      ProtectedMaterialUnavailableError
    )
    await assert.rejects(
      () => service.getView(requestFor(student.id, missingDerivative.id)),
      ProtectedMaterialUnavailableError
    )
  })

  test('records a failed access before rejecting a denied view and propagates audit failure', async ({
    assert,
  }) => {
    const { student, material } = await createHierarchy({ type: 'PDF' })
    const logs = new FakeAccessLog()
    const service = makeService(new FakeAccessControl({ VIEW: false, DOWNLOAD: false }), logs)

    await assert.rejects(
      () => service.getView(requestFor(student.id, material.id)),
      ProtectedMaterialForbiddenError
    )
    assert.equal(logs.inputs[0].action, 'FAILED_ACCESS')

    logs.error = new Error('audit database unavailable')
    await assert.rejects(
      () => service.getView(requestFor(student.id, material.id)),
      /audit database unavailable/
    )
  })

  test('rechecks VIEW for a matching derivative and never falls back to the original', async ({
    assert,
  }) => {
    const { student, material, module } = await createHierarchy({ type: 'PDF' })
    const page = await MaterialDerivative.create(derivative(material.id, 1, 0, 'private/page.webp'))
    const otherMaterial = await createMaterial(module.id, 'PDF', 'READY')
    const otherPage = await MaterialDerivative.create(
      derivative(otherMaterial.id, 1, 0, 'private/other.webp')
    )
    const access = new FakeAccessControl({ VIEW: true, DOWNLOAD: false })
    const logs = new FakeAccessLog()
    const storage = new MemoryStorage()
    storage.objects.set(page.storageKey, Buffer.from('protected-page'))
    const service = makeService(access, logs, storage)

    const result = await service.getDerivative({
      ...requestFor(student.id, material.id),
      derivativeId: page.id,
    })
    assert.equal(await streamText(result.stream), 'protected-page')
    assert.equal(result.mimeType, 'image/webp')
    assert.deepEqual(storage.readKeys, [page.storageKey])
    assert.lengthOf(logs.inputs, 0)

    await assert.rejects(
      () =>
        service.getDerivative({
          ...requestFor(student.id, material.id),
          derivativeId: otherPage.id,
        }),
      ProtectedMaterialNotFoundError
    )
    assert.deepEqual(storage.readKeys, [page.storageKey])

    access.allowed.VIEW = false
    await assert.rejects(
      () =>
        service.getDerivative({
          ...requestFor(student.id, material.id),
          derivativeId: page.id,
        }),
      ProtectedMaterialForbiddenError
    )
    assert.equal(logs.inputs.at(-1)?.action, 'FAILED_ACCESS')
    assert.deepEqual(storage.readKeys, [page.storageKey])
  })

  test('signs an allowed original for exactly 300 seconds and audits before returning it', async ({
    assert,
  }) => {
    const { student, material } = await createHierarchy({ type: 'PDF' })
    const access = new FakeAccessControl({ VIEW: false, DOWNLOAD: true })
    const logs = new FakeAccessLog()
    const storage = new MemoryStorage()
    storage.signedResult = {
      url: 'https://signed.invalid/opaque-token',
      expiresAt: '2026-09-06T12:05:30.000Z',
    }
    const service = makeService(access, logs, storage)

    const result = await service.createDownloadUrl(requestFor(student.id, material.id))

    assert.deepEqual(storage.signedInputs, [
      { key: material.storageKey, filename: material.originalFilename, expiresInSeconds: 300 },
    ])
    assert.deepEqual(result, {
      url: storage.signedResult.url,
      expiresAt: storage.signedResult.expiresAt,
    })
    assert.equal(logs.inputs[0].action, 'DOWNLOAD_MATERIAL')

    logs.error = new Error('audit failed after signing')
    await assert.rejects(
      () => service.createDownloadUrl(requestFor(student.id, material.id)),
      /audit failed after signing/
    )
  })

  test('logs late stream errors once without exposing the storage error or sending again', async ({
    assert,
  }) => {
    for (const emitChunkFirst of [false, true]) {
      const stream = new PassThrough()
      const logged: unknown[][] = []
      const responseCalls: string[] = []
      let streamErrorCallback: ((error: NodeJS.ErrnoException) => [string, number?]) | undefined
      const controller = new ProtectedMaterialsController()
      ;(
        controller as unknown as {
          delivery: {
            getDerivative(): Promise<{ stream: Readable; mimeType: string }>
          }
        }
      ).delivery = {
        async getDerivative() {
          return { stream, mimeType: 'image/webp' }
        },
      }
      const context = {
        auth: { use: () => ({ getUserOrFail: () => ({ id: 7 }) }) },
        params: { materialId: '11', derivativeId: '13' },
        request: { ip: () => '127.0.0.1', header: () => 'unit-test' },
        logger: { error: (...args: unknown[]) => logged.push(args) },
        response: {
          header(name: string) {
            responseCalls.push(`header:${name}`)
            return this
          },
          stream(_body: Readable, callback: (error: NodeJS.ErrnoException) => [string, number?]) {
            responseCalls.push('stream')
            streamErrorCallback = callback
          },
          internalServerError() {
            responseCalls.push('internalServerError')
          },
        },
      } as unknown as HttpContext

      await controller.derivative(context)
      stream.on('error', () => undefined)
      if (emitChunkFirst) stream.write('partial-image')
      stream.emit('error', new Error('S3 secret=private/derivative-key'))
      stream.emit('error', new Error('duplicate'))

      assert.deepEqual(logged, [
        [{ materialId: 11, derivativeId: 13 }, 'Protected material stream failed'],
      ])
      assert.notInclude(JSON.stringify(logged), 'secret')
      assert.notInclude(responseCalls, 'internalServerError')
      assert.deepEqual(streamErrorCallback?.(new Error('hidden')), [
        JSON.stringify({ message: 'Unable to deliver protected material' }),
        500,
      ])
    }
  })

  test('does not sign an original without DOWNLOAD and returns not-found for missing materials', async ({
    assert,
  }) => {
    const { student, material } = await createHierarchy({ type: 'PDF' })
    const logs = new FakeAccessLog()
    const storage = new MemoryStorage()
    const service = makeService(
      new FakeAccessControl({ VIEW: true, DOWNLOAD: false }),
      logs,
      storage
    )

    await assert.rejects(
      () => service.createDownloadUrl(requestFor(student.id, material.id)),
      ProtectedMaterialForbiddenError
    )
    assert.lengthOf(storage.signedInputs, 0)
    assert.equal(logs.inputs[0].action, 'FAILED_ACCESS')
    await assert.rejects(
      () => service.getView(requestFor(student.id, 2_000_000_000)),
      ProtectedMaterialNotFoundError
    )
  })
})

function makeService(
  accessControl: FakeAccessControl,
  accessLog: FakeAccessLog,
  storage: MemoryStorage = new MemoryStorage()
) {
  return new ProtectedMaterialDeliveryService({
    accessControl,
    accessLog,
    storage,
    now: () => now,
    apiBaseUrl: 'http://api.example.test',
  })
}

function requestFor(userId: number, materialId: number) {
  return {
    userId,
    materialId,
    ipAddress: '127.0.0.1',
    userAgent: 'unit-test',
  }
}

class FakeAccessControl {
  inputs: ResolveAccessInput[] = []

  constructor(public allowed: Record<'VIEW' | 'DOWNLOAD', boolean>) {}

  async resolve(input: ResolveAccessInput): Promise<AccessDecision> {
    this.inputs.push(input)
    const allowed = this.allowed[input.capability]
    return {
      allowed,
      decision: allowed ? 'ALLOW' : 'DENY',
      source: allowed ? 'MATERIAL' : 'DEFAULT',
      ruleId: null,
    }
  }
}

class FakeAccessLog {
  inputs: CreateAccessLogInput[] = []
  error?: Error

  async record(input: CreateAccessLogInput) {
    this.inputs.push(input)
    if (this.error) {
      throw this.error
    }
    return input
  }
}

class MemoryStorage implements StorageService {
  objects = new Map<string, Buffer>()
  readKeys: string[] = []
  signedInputs: CreateTemporaryDownloadUrlInput[] = []
  signedResult = {
    url: 'https://signed.invalid/download',
    expiresAt: '2026-09-06T12:05:00.000Z',
  }

  async ensurePrivateBucket() {}
  async putObject(_input: PutObjectInput) {}
  async getObject(key: string) {
    this.readKeys.push(key)
    const body = this.objects.get(key)
    if (!body) throw new Error('private storage key missing')
    return Readable.from(body)
  }
  async createTemporaryDownloadUrl(input: CreateTemporaryDownloadUrlInput) {
    this.signedInputs.push(input)
    return this.signedResult
  }
  async listKeys() {
    return []
  }
  async deleteObject() {}
  async exists(key: string) {
    return this.objects.has(key)
  }
}

async function createHierarchy(input: { type: 'PDF' | 'IMAGE' | 'ZIP' }) {
  const student = await User.create({
    email: `delivery-${Math.random()}@example.test`,
    password: 'student-password',
    role: 'STUDENT',
    status: 'ACTIVE',
  })
  const course = await Course.create({ title: 'Protected delivery course' })
  const module = await CourseModule.create({
    courseId: course.id,
    title: 'Protected delivery module',
    position: 0,
  })
  const material = await createMaterial(module.id, input.type, 'READY')
  return { student, course, module, material }
}

function createMaterial(
  moduleId: number,
  type: 'PDF' | 'IMAGE' | 'ZIP',
  processingStatus: 'READY' | 'PROCESSING'
) {
  return Material.create({
    moduleId,
    title: `${type} protected material`,
    type,
    storageKey: `originals/${type.toLowerCase()}-secret-${Math.random()}`,
    originalFilename: `${type.toLowerCase()}-original.${type === 'IMAGE' ? 'png' : type.toLowerCase()}`,
    mimeType: type === 'PDF' ? 'application/pdf' : 'application/octet-stream',
    size: 100,
    position: Math.floor(Math.random() * 1_000_000),
    processingStatus,
  })
}

function derivative(materialId: number, pageNumber: number | null, position: number, key: string) {
  return {
    materialId,
    kind: 'PDF_PAGE' as const,
    storageKey: key,
    mimeType: 'image/webp',
    pageNumber,
    width: 1200,
    height: 1600,
    position,
  }
}

async function streamText(stream: Readable) {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}
