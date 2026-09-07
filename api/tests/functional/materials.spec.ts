import Course from '#models/course'
import CourseModule from '#models/course_module'
import AccessLog from '#models/access_log'
import Material from '#models/material'
import MaterialDerivative from '#models/material_derivative'
import ImageTileManifest from '#models/image_tile_manifest'
import ProcessingJob from '#models/processing_job'
import StorageCleanupTask from '#models/storage_cleanup_task'
import { cleanupMultipartFile } from '#middleware/multipart_cleanup_middleware'
import MinioStorageProvider from '#services/minio_storage_provider'
import ProcessingJobService from '#services/processing_job_service'
import ProcessingWorker from '#services/processing_worker'
import UploadSetting from '#models/upload_setting'
import MaterialTransformer from '#transformers/material_transformer'
import UploadSettingTransformer from '#transformers/upload_setting_transformer'
import bodyParserConfig, { multipartTmpDirectory } from '#config/bodyparser'
import { collectMultipartFilePaths } from '#middleware/multipart_file_collector'
import User from '#models/user'
import { csrfSessionFrom, postLogin, withCsrf, type CsrfSession } from '#tests/helpers/csrf'
import type { ApiClient } from '@japa/api-client'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { test } from '@japa/runner'
import type { MultipartFile } from '@adonisjs/bodyparser/types'
import type { HttpContext } from '@adonisjs/core/http'
import { readdir, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname } from 'node:path'

const initialPassword = 'initial-password-123'

async function login(client: ApiClient, user: User): Promise<CsrfSession> {
  const response = await postLogin(client, {
    email: user.email,
    password: initialPassword,
  })
  response.assertStatus(200)

  return csrfSessionFrom(response)
}

const pdfFile = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n')
const pngFile = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
)
const zipFile = Buffer.from('UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==', 'base64')

test.group('Material persistence contracts', (group) => {
  let cleanupDatabase: () => Promise<void>
  let migrationDefaults: UploadSetting[]

  group.each.setup(async () => {
    cleanupDatabase = await testUtils.db().truncate()
    migrationDefaults = await UploadSetting.query().orderBy('type', 'asc')
    await cleanupDatabase()
    await UploadSetting.createMany([
      { type: 'PDF', maxSizeBytes: 104857600 },
      { type: 'IMAGE', maxSizeBytes: 104857600 },
      { type: 'ZIP', maxSizeBytes: 104857600 },
    ])
  })

  group.each.teardown(async () => {
    await cleanupDatabase()
    await UploadSetting.createMany([
      { type: 'PDF', maxSizeBytes: 104857600 },
      { type: 'IMAGE', maxSizeBytes: 104857600 },
      { type: 'ZIP', maxSizeBytes: 104857600 },
    ])
  })

  test('loads module materials in ascending position order', async ({ assert }) => {
    const course = await Course.create({ title: 'Private materials course' })
    const module = await CourseModule.create({
      courseId: course.id,
      title: 'Module',
      position: 0,
    })
    await module.related('materials').createMany([
      {
        title: 'Second',
        type: 'PDF',
        storageKey: 'originals/second.pdf',
        originalFilename: 'second.pdf',
        mimeType: 'application/pdf',
        size: 10,
        position: 1,
        processingStatus: 'PROCESSING',
      },
      {
        title: 'First',
        type: 'PDF',
        storageKey: 'originals/first.pdf',
        originalFilename: 'first.pdf',
        mimeType: 'application/pdf',
        size: 10,
        position: 0,
        processingStatus: 'PROCESSING',
      },
    ])

    await module.load('materials')

    assert.deepEqual(
      module.materials.map((material) => material.position),
      [0, 1]
    )
  })

  test('enforces a unique material position within each module', async ({ assert }) => {
    const course = await Course.create({ title: 'Private materials course' })
    const module = await CourseModule.create({
      courseId: course.id,
      title: 'Module',
      position: 0,
    })
    const attributes = {
      moduleId: module.id,
      title: 'First',
      type: 'PDF' as const,
      storageKey: 'originals/first.pdf',
      originalFilename: 'first.pdf',
      mimeType: 'application/pdf',
      size: 10,
      position: 0,
      processingStatus: 'PROCESSING' as const,
    }
    await Material.create(attributes)

    await assert.rejects(() => Material.create({ ...attributes, title: 'Duplicate' }))
  })

  test('serializes material metadata without its private storage key', ({ assert }) => {
    const material = new Material()
    material.id = 7
    material.moduleId = 2
    material.title = 'Handbook'
    material.description = null
    material.type = 'PDF'
    material.storageKey = 'originals/private-handbook.pdf'
    material.originalFilename = 'handbook.pdf'
    material.mimeType = 'application/pdf'
    material.size = 1024
    material.position = 0
    material.processingStatus = 'PROCESSING'

    const serialized = new MaterialTransformer(material).toObject()

    assert.deepEqual(serialized, {
      id: 7,
      moduleId: 2,
      title: 'Handbook',
      description: null,
      type: 'PDF',
      originalFilename: 'handbook.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      position: 0,
      processingStatus: 'PROCESSING',
      createdAt: material.createdAt,
      updatedAt: material.updatedAt,
    })
    assert.notProperty(serialized, 'storageKey')
  })

  test('serializes a safe failed processing code without private derivative metadata', ({
    assert,
  }) => {
    const material = new Material()
    material.id = 7
    material.moduleId = 2
    material.title = 'Handbook'
    material.description = null
    material.type = 'PDF'
    material.storageKey = 'originals/private-handbook.pdf'
    material.originalFilename = 'handbook.pdf'
    material.mimeType = 'application/pdf'
    material.size = 1024
    material.position = 0
    material.processingStatus = 'FAILED'
    material.processingErrorCode = 'PDF_PAGE_LIMIT_EXCEEDED'

    const serialized = new MaterialTransformer(material).toObject()

    assert.deepInclude(serialized, {
      processingStatus: 'FAILED',
      processingErrorCode: 'PDF_PAGE_LIMIT_EXCEEDED',
    })
    assert.notProperty(serialized, 'storageKey')
    assert.notProperty(serialized, 'derivatives')
    assert.notInclude(JSON.stringify(serialized), 'originals/')

    material.processingErrorCode = 'INTERNAL_EXCEPTION_DETAIL' as never
    assert.notProperty(new MaterialTransformer(material).toObject(), 'processingErrorCode')
  })

  test('does not serialize a private derivative storage key', ({ assert }) => {
    const derivative = new MaterialDerivative()
    derivative.id = 11
    derivative.materialId = 7
    derivative.kind = 'PDF_PAGE'
    derivative.storageKey = 'derivatives/7/private-run/page-1.webp'
    derivative.mimeType = 'image/webp'
    derivative.pageNumber = 1
    derivative.width = 100
    derivative.height = 100
    derivative.position = 0

    const serialized = derivative.serialize()

    assert.notProperty(serialized, 'storageKey')
    assert.notProperty(serialized, 'storage_key')
    assert.notInclude(JSON.stringify(serialized), 'derivatives/')
  })

  test('persists and serializes the three 100 MB upload defaults', async ({ assert }) => {
    assert.deepEqual(
      migrationDefaults.map((setting) => ({
        type: setting.type,
        maxSizeBytes: setting.maxSizeBytes,
      })),
      [
        { type: 'IMAGE', maxSizeBytes: 104857600 },
        { type: 'PDF', maxSizeBytes: 104857600 },
        { type: 'ZIP', maxSizeBytes: 104857600 },
      ]
    )

    const settings = await UploadSetting.query().orderBy('type', 'asc')

    assert.deepEqual(
      settings.map((setting) => ({ type: setting.type, maxSizeBytes: setting.maxSizeBytes })),
      [
        { type: 'IMAGE', maxSizeBytes: 104857600 },
        { type: 'PDF', maxSizeBytes: 104857600 },
        { type: 'ZIP', maxSizeBytes: 104857600 },
      ]
    )
    assert.deepEqual(new UploadSettingTransformer(settings[0]).toObject(), {
      type: 'IMAGE',
      maxSizeBytes: 104857600,
    })
  })

  test('allows multipart framing overhead above the 1 GiB per-file limit', ({ assert }) => {
    const parserLimit = Number(bodyParserConfig.multipart.limit)
    const oneGiB = 1024 * 1024 * 1024

    assert.isAbove(parserLimit, oneGiB)
    assert.isAtMost(parserLimit, oneGiB + 2 * 1024 * 1024)
  })

  test('does not auto-process multipart files before route authorization', async ({
    assert,
    client,
  }) => {
    assert.isFalse(bodyParserConfig.multipart.autoProcess)

    const beforeLogin = await temporaryFiles()
    const loginResponse = await client
      .post('/api/v1/auth/login')
      .field('email', 'not-a-real-user@example.com')
      .field('password', initialPassword)
      .file('unrelated', pdfFile, {
        filename: 'unrelated.pdf',
        contentType: 'application/pdf',
      })
    assert.isAtMost(loginResponse.status(), 499)
    assert.deepEqual(await newTemporaryFiles(beforeLogin), [])

    const beforeNonMaterial = await temporaryFiles()
    const nonMaterialResponse = await client
      .post('/api/v1/account/logout')
      .file('unrelated', pdfFile, {
        filename: 'unrelated.pdf',
        contentType: 'application/pdf',
      })
    assert.isAtMost(nonMaterialResponse.status(), 499)
    assert.deepEqual(await newTemporaryFiles(beforeNonMaterial), [])
  })

  test('cleans a multipart temporary path and ignores an already missing path', async ({
    assert,
  }) => {
    const removedPaths: string[] = []
    const logger = {
      error: () => assert.fail('cleanup should not log for success or ENOENT'),
    } as unknown as HttpContext['logger']
    const file = { tmpPath: '/tmp/material-upload-success' } as MultipartFile

    await cleanupMultipartFile(file, logger, async (path) => {
      removedPaths.push(path)
    })
    await cleanupMultipartFile(
      { tmpPath: '/tmp/material-upload-missing' } as MultipartFile,
      logger,
      async () => {
        const error = new Error('already gone') as NodeJS.ErrnoException
        error.code = 'ENOENT'
        throw error
      }
    )

    assert.deepEqual(removedPaths, ['/tmp/material-upload-success'])
  })

  test('logs but does not fail the request when temporary cleanup has an unexpected error', async ({
    assert,
  }) => {
    let logged = false
    const error = new Error('permission denied') as NodeJS.ErrnoException
    error.code = 'EACCES'

    await cleanupMultipartFile(
      { tmpPath: '/tmp/material-upload-unremovable' } as MultipartFile,
      { error: () => (logged = true) } as unknown as HttpContext['logger'],
      async () => {
        throw error
      }
    )

    assert.isTrue(logged)
  })

  test('collects nested multipart paths recursively and only once', ({ assert }) => {
    const sharedFile = { tmpPath: '/tmp/shared-material-upload' }
    const files: Record<string, unknown> = {
      file: [sharedFile, { retained: sharedFile }],
      extra: { nested: { tmpPath: '/tmp/extra-material-upload' } },
    }
    files.circular = files

    assert.deepEqual(collectMultipartFilePaths(files), [
      '/tmp/shared-material-upload',
      '/tmp/extra-material-upload',
    ])
  })
})

test.group('Administrative upload settings', (group) => {
  let admin: User
  let student: User
  let cleanupDatabase: () => Promise<void>

  group.each.setup(async () => {
    cleanupDatabase = await testUtils.db().truncate()
    await cleanupDatabase()
    await UploadSetting.createMany([
      { type: 'PDF', maxSizeBytes: 104857600 },
      { type: 'IMAGE', maxSizeBytes: 104857600 },
      { type: 'ZIP', maxSizeBytes: 104857600 },
    ])
    ;[admin, student] = await User.createMany([
      {
        fullName: 'Ada Admin',
        email: 'materials.admin@example.test',
        password: initialPassword,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
      {
        fullName: 'Sam Student',
        email: 'materials.student@example.test',
        password: initialPassword,
        role: 'STUDENT',
        status: 'ACTIVE',
      },
    ])
  })

  group.each.teardown(async () => {
    await cleanupDatabase()
    await UploadSetting.createMany([
      { type: 'PDF', maxSizeBytes: 104857600 },
      { type: 'IMAGE', maxSizeBytes: 104857600 },
      { type: 'ZIP', maxSizeBytes: 104857600 },
    ])
  })

  test('lists all configured byte limits for an administrator', async ({ assert, client }) => {
    const session = await login(client, admin)
    const response = await client.get('/api/v1/upload-settings').cookie(session.name, session.value)

    response.assertStatus(200)
    assert.deepEqual(response.body(), {
      data: [
        { type: 'PDF', maxSizeBytes: 104857600 },
        { type: 'IMAGE', maxSizeBytes: 104857600 },
        { type: 'ZIP', maxSizeBytes: 104857600 },
      ],
    })
  })

  test('denies upload settings to students and guests', async ({ client }) => {
    const studentSession = await login(client, student)

    const studentResponse = await client
      .get('/api/v1/upload-settings')
      .cookie(studentSession.name, studentSession.value)
    studentResponse.assertStatus(403)

    const guestResponse = await client.get('/api/v1/upload-settings')
    guestResponse.assertStatus(401)
  })

  test('updates an integer MB limit and persists the byte value', async ({ assert, client }) => {
    const session = await login(client, admin)
    const response = await withCsrf(
      client.patch('/api/v1/upload-settings/PDF'),
      session
    ).unsafeJson({ maxSizeMb: 25 })

    response.assertStatus(200)
    assert.deepEqual(response.body(), {
      data: { type: 'PDF', maxSizeBytes: 26214400 },
    })
    const setting = await UploadSetting.findOrFail('PDF')
    assert.equal(setting.maxSizeBytes, 26214400)
  })

  test('rejects invalid setting types and MB limits', async ({ client }) => {
    const session = await login(client, admin)
    const invalidRequests = [
      ['/api/v1/upload-settings/PDF', { maxSizeMb: 0 }],
      ['/api/v1/upload-settings/PDF', { maxSizeMb: 1.5 }],
      ['/api/v1/upload-settings/PDF', { maxSizeMb: 1025 }],
      ['/api/v1/upload-settings/PDF', { maxSizeMb: '25' }],
      ['/api/v1/upload-settings/AUDIO', { maxSizeMb: 25 }],
    ] as const

    for (const [path, payload] of invalidRequests) {
      const response = await withCsrf(client.patch(path), session).unsafeJson(payload)
      response.assertStatus(422)
    }
  })

  test('protects setting updates with CSRF and administrator authorization', async ({ client }) => {
    const adminSession = await login(client, admin)
    const missingCsrf = await client
      .patch('/api/v1/upload-settings/PDF')
      .redirects(0)
      .cookie(adminSession.name, adminSession.value)
      .unsafeJson({ maxSizeMb: 25 })
    missingCsrf.assertStatus(302)

    const studentSession = await login(client, student)
    const studentResponse = await withCsrf(
      client.patch('/api/v1/upload-settings/PDF'),
      studentSession
    ).unsafeJson({ maxSizeMb: 25 })
    studentResponse.assertStatus(403)

    const guestCsrf = await client.get('/api/v1/account/profile')
    guestCsrf.assertStatus(401)
    const guestResponse = await withCsrf(
      client.patch('/api/v1/upload-settings/PDF'),
      csrfSessionFrom(guestCsrf)
    ).unsafeJson({ maxSizeMb: 25 })
    guestResponse.assertStatus(401)
  })
})

test.group('Administrative material uploads', (group) => {
  let admin: User
  let student: User
  let course: Course
  let module: CourseModule
  let secondModule: CourseModule
  let cleanupDatabase: () => Promise<void>
  let storageOperations: string[]
  let storedKeys: Set<string>
  const originalEnsurePrivateBucket = MinioStorageProvider.prototype.ensurePrivateBucket
  const originalPutObject = MinioStorageProvider.prototype.putObject
  const originalDeleteObject = MinioStorageProvider.prototype.deleteObject
  const originalExists = MinioStorageProvider.prototype.exists
  const originalListKeys = MinioStorageProvider.prototype.listKeys

  group.each.setup(async () => {
    cleanupDatabase = await testUtils.db().truncate()
    await cleanupDatabase()
    await UploadSetting.createMany([
      { type: 'PDF', maxSizeBytes: 104857600 },
      { type: 'IMAGE', maxSizeBytes: 104857600 },
      { type: 'ZIP', maxSizeBytes: 104857600 },
    ])
    ;[admin, student] = await User.createMany([
      {
        fullName: 'Ada Admin',
        email: 'uploads.admin@example.test',
        password: initialPassword,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
      {
        fullName: 'Sam Student',
        email: 'uploads.student@example.test',
        password: initialPassword,
        role: 'STUDENT',
        status: 'ACTIVE',
      },
    ])
    course = await Course.create({ title: 'Private material uploads' })
    ;[module, secondModule] = await CourseModule.createMany([
      { courseId: course.id, title: 'First module', position: 0 },
      { courseId: course.id, title: 'Second module', position: 1 },
    ])

    storageOperations = []
    storedKeys = new Set()
    MinioStorageProvider.prototype.ensurePrivateBucket = async () => {
      storageOperations.push('ensure')
    }
    MinioStorageProvider.prototype.putObject = async (input) => {
      storageOperations.push(`put:${input.key}:${input.contentType}`)
      storedKeys.add(input.key)
    }
    MinioStorageProvider.prototype.deleteObject = async (key) => {
      storageOperations.push(`delete:${key}`)
      storedKeys.delete(key)
    }
    MinioStorageProvider.prototype.exists = async (key) => storedKeys.has(key)
    MinioStorageProvider.prototype.listKeys = async (prefix) =>
      [...storedKeys].filter((key) => key.startsWith(prefix))
  })

  group.each.teardown(async () => {
    MinioStorageProvider.prototype.ensurePrivateBucket = originalEnsurePrivateBucket
    MinioStorageProvider.prototype.putObject = originalPutObject
    MinioStorageProvider.prototype.deleteObject = originalDeleteObject
    MinioStorageProvider.prototype.exists = originalExists
    MinioStorageProvider.prototype.listKeys = originalListKeys
    await db.rawQuery('DROP TRIGGER IF EXISTS reject_material_insert ON materials')
    await db.rawQuery('DROP FUNCTION IF EXISTS reject_material_insert()')
    await cleanupDatabase()
    await UploadSetting.createMany([
      { type: 'PDF', maxSizeBytes: 104857600 },
      { type: 'IMAGE', maxSizeBytes: 104857600 },
      { type: 'ZIP', maxSizeBytes: 104857600 },
    ])
  })

  test('stores valid PDF, image, and ZIP originals with server-owned metadata', async ({
    assert,
    client,
  }) => {
    const session = await login(client, admin)
    const uploads = [
      {
        moduleId: module.id,
        title: '  PDF manual  ',
        description: '  Main handbook  ',
        contents: pdfFile,
        filename: 'manual.pdf',
        contentType: 'application/pdf',
        type: 'PDF',
        mimeType: 'application/pdf',
        position: 0,
      },
      {
        moduleId: module.id,
        title: 'Course diagram',
        description: undefined,
        contents: pngFile,
        filename: 'diagram.png',
        contentType: 'image/png',
        type: 'IMAGE',
        mimeType: 'image/png',
        position: 1,
      },
      {
        moduleId: secondModule.id,
        title: 'Exercise archive',
        description: undefined,
        contents: zipFile,
        filename: 'exercises.zip',
        contentType: 'application/zip',
        type: 'ZIP',
        mimeType: 'application/zip',
        position: 0,
      },
    ] as const

    for (const upload of uploads) {
      let request = withCsrf(
        client.post(`/api/v1/modules/${upload.moduleId}/materials`),
        session
      ).field('title', upload.title)
      if (upload.description !== undefined) {
        request = request.field('description', upload.description)
      }
      const response = await request.file('file', upload.contents, {
        filename: upload.filename,
        contentType: upload.contentType,
      })

      response.assertStatus(201)
      response.assertBodyContains({
        data: {
          moduleId: upload.moduleId,
          title: upload.title.trim(),
          description: upload.description?.trim() ?? null,
          type: upload.type,
          originalFilename: upload.filename,
          mimeType: upload.mimeType,
          size: upload.contents.length,
          position: upload.position,
          processingStatus: 'PROCESSING',
        },
      })
      const responseText = JSON.stringify(response.body())
      assert.notInclude(responseText, 'storageKey')
      assert.notInclude(responseText, 'storage_key')
      assert.notInclude(responseText.toLowerCase(), 'url')
      assert.notInclude(responseText, 'originals/')
    }

    const materials = await Material.query().orderBy('id', 'asc')
    assert.lengthOf(materials, 3)
    assert.deepEqual(
      materials.map((material) => material.processingStatus),
      ['PROCESSING', 'PROCESSING', 'PROCESSING']
    )
    assert.equal(new Set(materials.map((material) => material.storageKey)).size, 3)
    for (const material of materials) {
      assert.match(
        material.storageKey,
        /^originals\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      )
      assert.isTrue(storedKeys.has(material.storageKey))
    }
    const jobs = await ProcessingJob.query().orderBy('material_id', 'asc')
    assert.deepEqual(
      jobs.map((job) => ({
        materialId: job.materialId,
        kind: job.kind,
        status: job.status,
        maxAttempts: job.maxAttempts,
      })),
      [
        {
          materialId: materials[0].id,
          kind: 'PDF_RENDER',
          status: 'PENDING',
          maxAttempts: 3,
        },
        {
          materialId: materials[1].id,
          kind: 'IMAGE_DERIVATIVE',
          status: 'PENDING',
          maxAttempts: 3,
        },
      ]
    )
    assert.deepEqual(
      storageOperations.filter(
        (operation) => operation === 'ensure' || operation.startsWith('put:')
      ),
      [
        'ensure',
        `put:${materials[0].storageKey}:application/pdf`,
        'ensure',
        `put:${materials[1].storageKey}:image/png`,
        'ensure',
        `put:${materials[2].storageKey}:application/zip`,
      ]
    )
  })

  test('does not stage or store an unauthenticated material multipart upload', async ({
    assert,
    client,
  }) => {
    const originalTmpFileName = bodyParserConfig.multipart.tmpFileName
    let stagedFiles = 0
    bodyParserConfig.multipart.tmpFileName = () => {
      stagedFiles++
      return originalTmpFileName!()
    }

    const before = await temporaryFiles()
    try {
      const response = await client
        .post(`/api/v1/modules/${module.id}/materials`)
        .redirects(0)
        .field('title', 'Unauthenticated material')
        .file('file', pdfFile, { filename: 'unauthorized.pdf', contentType: 'application/pdf' })

      response.assertStatus(302)
    } finally {
      bodyParserConfig.multipart.tmpFileName = originalTmpFileName
    }

    assert.equal(stagedFiles, 0)
    assert.deepEqual(await newTemporaryFiles(before), [])
    assert.deepEqual(storageOperations, [])
  })

  test('accepts an upload above 20 MB when its database limit permits it', async ({ client }) => {
    await UploadSetting.updateOrCreate({ type: 'PDF' }, { maxSizeBytes: 21 * 1024 * 1024 })
    const largePdf = Buffer.alloc(20 * 1024 * 1024 + 1)
    pdfFile.copy(largePdf)
    const session = await login(client, admin)
    const response = await withCsrf(client.post(`/api/v1/modules/${module.id}/materials`), session)
      .field('title', 'Large manual')
      .file('file', largePdf, { filename: 'large.pdf', contentType: 'application/pdf' })

    response.assertStatus(201)
  })

  test('rejects a file over its configured type limit before storage', async ({
    assert,
    client,
  }) => {
    await UploadSetting.updateOrCreate({ type: 'PDF' }, { maxSizeBytes: pdfFile.length - 1 })
    const session = await login(client, admin)
    const response = await withCsrf(client.post(`/api/v1/modules/${module.id}/materials`), session)
      .field('title', 'Manual')
      .file('file', pdfFile, { filename: 'manual.pdf', contentType: 'application/pdf' })

    response.assertStatus(422)
    assert.deepEqual(storageOperations, [])
    assert.equal(await materialCount(), 0)
  })

  test('rejects extension, declared MIME, and magic mismatches before storage', async ({
    assert,
    client,
  }) => {
    const session = await login(client, admin)
    const mismatches = [
      { contents: pdfFile, filename: 'manual.zip', contentType: 'application/pdf' },
      { contents: pdfFile, filename: 'manual.pdf', contentType: 'application/zip' },
      {
        contents: Buffer.from('not a real pdf'),
        filename: 'manual.pdf',
        contentType: 'application/pdf',
      },
    ]

    for (const mismatch of mismatches) {
      const response = await withCsrf(
        client.post(`/api/v1/modules/${module.id}/materials`),
        session
      )
        .field('title', 'Mismatched material')
        .file('file', mismatch.contents, {
          filename: mismatch.filename,
          contentType: mismatch.contentType,
        })
      response.assertStatus(422)
    }

    assert.deepEqual(storageOperations, [])
    assert.equal(await materialCount(), 0)
  })

  test('validates required file, title, and description before storage', async ({
    assert,
    client,
  }) => {
    const session = await login(client, admin)
    const missingFile = await withCsrf(
      client.post(`/api/v1/modules/${module.id}/materials`),
      session
    ).field('title', 'Manual')
    missingFile.assertStatus(422)

    const shortTitle = await withCsrf(
      client.post(`/api/v1/modules/${module.id}/materials`),
      session
    )
      .field('title', 'X')
      .file('file', pdfFile, { filename: 'manual.pdf', contentType: 'application/pdf' })
    shortTitle.assertStatus(422)

    const longDescription = await withCsrf(
      client.post(`/api/v1/modules/${module.id}/materials`),
      session
    )
      .field('title', 'Manual')
      .field('description', 'x'.repeat(2001))
      .file('file', pdfFile, { filename: 'manual.pdf', contentType: 'application/pdf' })
    longDescription.assertStatus(422)

    assert.deepEqual(storageOperations, [])
    assert.equal(await materialCount(), 0)
  })

  test('returns no material or storage details when object storage fails', async ({
    assert,
    client,
  }) => {
    MinioStorageProvider.prototype.putObject = async () => {
      throw new Error('S3_SECRET_KEY=do-not-leak endpoint=http://private-minio:9000')
    }
    const session = await login(client, admin)
    const response = await withCsrf(client.post(`/api/v1/modules/${module.id}/materials`), session)
      .field('title', 'Manual')
      .file('file', pdfFile, { filename: 'manual.pdf', contentType: 'application/pdf' })

    response.assertStatus(500)
    assert.deepEqual(response.body(), { message: 'Unable to store material' })
    assert.notInclude(JSON.stringify(response.body()), 'do-not-leak')
    assert.equal(await materialCount(), 0)
  })

  test('removes the uploaded object when database material creation fails', async ({
    assert,
    client,
  }) => {
    await db.rawQuery(`
      CREATE FUNCTION reject_material_insert() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'private database failure';
      END;
      $$ LANGUAGE plpgsql
    `)
    await db.rawQuery(`
      CREATE TRIGGER reject_material_insert
      BEFORE INSERT ON materials
      FOR EACH ROW EXECUTE FUNCTION reject_material_insert()
    `)
    const session = await login(client, admin)
    const response = await withCsrf(client.post(`/api/v1/modules/${module.id}/materials`), session)
      .field('title', 'Manual')
      .file('file', pdfFile, { filename: 'manual.pdf', contentType: 'application/pdf' })

    response.assertStatus(500)
    assert.deepEqual(response.body(), { message: 'Unable to store material' })
    assert.equal(await materialCount(), 0)
    assert.lengthOf(storageOperations, 3)
    assert.equal(storageOperations[0], 'ensure')
    assert.match(storageOperations[1], /^put:originals\/[0-9a-f-]{36}:application\/pdf$/)
    assert.equal(
      storageOperations[2],
      storageOperations[1].replace(/^put:([^:]+):.*$/, 'delete:$1')
    )
    assert.equal(storedKeys.size, 0)
  })

  test('protects material listing and uploads by session, administrator, and CSRF', async ({
    assert,
    client,
  }) => {
    const guestList = await client.get(`/api/v1/modules/${module.id}/materials`)
    guestList.assertStatus(401)

    const studentSession = await login(client, student)
    const beforeStudentUpload = await temporaryFiles()
    const studentList = await client
      .get(`/api/v1/modules/${module.id}/materials`)
      .cookie(studentSession.name, studentSession.value)
    studentList.assertStatus(403)
    const studentUpload = await withCsrf(
      client.post(`/api/v1/modules/${module.id}/materials`),
      studentSession
    )
      .field('title', 'Forbidden upload')
      .file('file', pdfFile, { filename: 'manual.pdf', contentType: 'application/pdf' })
    studentUpload.assertStatus(403)
    assert.deepEqual(await newTemporaryFiles(beforeStudentUpload), [])

    const adminSession = await login(client, admin)
    const beforeMissingCsrf = await temporaryFiles()
    const missingCsrf = await client
      .post(`/api/v1/modules/${module.id}/materials`)
      .redirects(0)
      .cookie(adminSession.name, adminSession.value)
      .field('title', 'Missing CSRF')
      .file('file', pdfFile, { filename: 'manual.pdf', contentType: 'application/pdf' })
    missingCsrf.assertStatus(302)
    assert.deepEqual(await newTemporaryFiles(beforeMissingCsrf), [])

    const guestCsrfResponse = await client.get('/api/v1/account/profile')
    guestCsrfResponse.assertStatus(401)
    const beforeGuestUpload = await temporaryFiles()
    const guestUpload = await withCsrf(
      client.post(`/api/v1/modules/${module.id}/materials`),
      csrfSessionFrom(guestCsrfResponse)
    )
      .field('title', 'Guest upload')
      .file('file', pdfFile, { filename: 'manual.pdf', contentType: 'application/pdf' })
    guestUpload.assertStatus(401)
    assert.deepEqual(await newTemporaryFiles(beforeGuestUpload), [])
  })

  test('cleans every temporary file from repeated and extra multipart parts', async ({
    assert,
    client,
  }) => {
    const session = await login(client, admin)
    const before = await temporaryFiles()
    const response = await withCsrf(client.post(`/api/v1/modules/${module.id}/materials`), session)
      .field('title', 'Repeated file material')
      .file('file', pdfFile, { filename: 'first.pdf', contentType: 'application/pdf' })
      .file('file', pngFile, { filename: 'second.png', contentType: 'image/png' })
      .file('extra', zipFile, { filename: 'extra.zip', contentType: 'application/zip' })

    response.assertStatus(201)
    assert.equal(await materialCount(), 1)
    assert.deepEqual(await newTemporaryFiles(before), [])
  })

  test('cleans multipart files when the parser rejects a malformed multi-part body', async ({
    assert,
    client,
  }) => {
    const session = await login(client, admin)
    const boundary = 'task2-malformed-boundary'
    const body = Buffer.from(
      [
        `--${boundary}`,
        'Content-Disposition: form-data; name="title"',
        '',
        'Malformed upload',
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="first.pdf"',
        'Content-Type: application/pdf',
        '',
        '%PDF-1.7\n',
        `--${boundary}`,
        'Content-Disposition: form-data; name="extra"; filename="second.zip"',
        'Content-Type: application/zip',
        '',
        'PK\x03\x04',
      ].join('\r\n')
    )
    const before = await temporaryFiles()
    const malformedRequest = withCsrf(
      client.post(`/api/v1/modules/${module.id}/materials`),
      session
    ).header('content-type', `multipart/form-data; boundary=${boundary}`)
    malformedRequest.request.send(body)
    const response = await malformedRequest.send()

    assert.isAtLeast(response.status(), 400)
    assert.deepEqual(await newTemporaryFiles(before), [])
  })

  test('cleans nested multipart files when the parser rejects malformed input', async ({
    assert,
    client,
  }) => {
    const session = await login(client, admin)
    const boundary = 'task2-malformed-nested-boundary'
    const body = Buffer.from(
      [
        `--${boundary}`,
        'Content-Disposition: form-data; name="title"',
        '',
        'Malformed nested upload',
        `--${boundary}`,
        'Content-Disposition: form-data; name="file[retained]"; filename="retained.png"',
        'Content-Type: image/png',
        '',
        'nested file contents',
        `--${boundary}`,
        'Content-Disposition: form-data; name="extra"; filename="second.zip"',
        'Content-Type: application/zip',
        '',
        'PK\\x03\\x04',
      ].join('\r\n')
    )
    const before = await temporaryFiles()
    const malformedRequest = withCsrf(
      client.post(`/api/v1/modules/${module.id}/materials`),
      session
    ).header('content-type', `multipart/form-data; boundary=${boundary}`)
    malformedRequest.request.send(body)
    const response = await malformedRequest.send()

    assert.isAtLeast(response.status(), 400)
    assert.deepEqual(await newTemporaryFiles(before), [])
  })

  test('uses a private temporary directory and 0600 upload files', async ({ assert, client }) => {
    const session = await login(client, admin)
    const observedModes: Array<{ file: number; directory: number }> = []
    const originalPutObjectForModes = MinioStorageProvider.prototype.putObject
    MinioStorageProvider.prototype.putObject = async (input) => {
      const filePath = String((input.body as { path?: string }).path)
      const [fileStats, directoryStats] = await Promise.all([
        stat(filePath),
        stat(dirname(filePath)),
      ])
      observedModes.push({
        file: fileStats.mode & 0o777,
        directory: directoryStats.mode & 0o777,
      })
    }

    try {
      const response = await withCsrf(
        client.post(`/api/v1/modules/${module.id}/materials`),
        session
      )
        .field('title', 'Private temporary material')
        .file('file', pdfFile, { filename: 'private.pdf', contentType: 'application/pdf' })
      response.assertStatus(201)
    } finally {
      MinioStorageProvider.prototype.putObject = originalPutObjectForModes
    }

    assert.deepEqual(observedModes, [{ file: 0o600, directory: 0o700 }])
    assert.include(multipartTmpDirectory, 'ideal-learning-materials')
  })

  test('secures nested multipart file fields before storing the material', async ({
    assert,
    client,
  }) => {
    const session = await login(client, admin)
    const observedModes: number[] = []
    const originalPutObjectForNestedModes = MinioStorageProvider.prototype.putObject
    MinioStorageProvider.prototype.putObject = async (input) => {
      const filePath = String((input.body as { path?: string }).path)
      const directory = dirname(filePath)
      const files = await readdir(directory)
      await Promise.all(
        files.map(async (file) => {
          const fileStats = await stat(`${directory}/${file}`)
          observedModes.push(fileStats.mode & 0o777)
        })
      )
    }

    try {
      const response = await withCsrf(
        client.post(`/api/v1/modules/${module.id}/materials`),
        session
      )
        .field('title', 'Nested temporary material')
        .file('file', pdfFile, { filename: 'primary.pdf', contentType: 'application/pdf' })
        .file('file[retained]', pngFile, {
          filename: 'retained.png',
          contentType: 'image/png',
        })

      response.assertStatus(201)
    } finally {
      MinioStorageProvider.prototype.putObject = originalPutObjectForNestedModes
    }

    assert.lengthOf(observedModes, 2)
    assert.deepEqual(observedModes, [0o600, 0o600])
  })

  test('rejects an unknown module before writing to storage', async ({ assert, client }) => {
    const session = await login(client, admin)
    const response = await withCsrf(client.post('/api/v1/modules/2147483647/materials'), session)
      .field('title', 'Orphan material')
      .file('file', pdfFile, { filename: 'manual.pdf', contentType: 'application/pdf' })

    response.assertStatus(404)
    assert.notInclude(JSON.stringify(response.body()), 'Cannot POST')
    assert.deepEqual(storageOperations, [])
    assert.equal(await materialCount(), 0)
  })

  test('returns no content when deleting from an unknown module', async ({ assert, client }) => {
    const session = await login(client, admin)
    storageOperations = []

    const response = await withCsrf(
      client.delete('/api/v1/modules/2147483647/materials/1'),
      session
    )

    response.assertStatus(204)
    assert.deepEqual(storageOperations, [])
  })

  test('updates only material metadata when the material belongs to the module', async ({
    assert,
    client,
  }) => {
    const session = await login(client, admin)
    const created = await withCsrf(client.post(`/api/v1/modules/${module.id}/materials`), session)
      .field('title', 'Original title')
      .field('description', 'Original description')
      .file('file', pdfFile, { filename: 'manual.pdf', contentType: 'application/pdf' })
    created.assertStatus(201)
    const materialId = created.body().data.id
    storageOperations = []

    const response = await withCsrf(
      client.patch(`/api/v1/modules/${module.id}/materials/${materialId}`),
      session
    ).unsafeJson({ title: '  Updated title  ', description: '  Updated description  ' })

    response.assertStatus(200)
    response.assertBodyContains({
      data: {
        id: materialId,
        moduleId: module.id,
        title: 'Updated title',
        description: 'Updated description',
      },
    })
    assert.deepEqual(storageOperations, [])
    const material = await Material.findOrFail(materialId)
    assert.equal(material.storageKey.startsWith('originals/'), true)
  })

  test('lists module materials in position order without private storage fields', async ({
    assert,
    client,
  }) => {
    const session = await login(client, admin)
    for (const title of ['Second listed material', 'First listed material']) {
      const created = await withCsrf(client.post(`/api/v1/modules/${module.id}/materials`), session)
        .field('title', title)
        .file('file', pdfFile, {
          filename: `${title.slice(0, 5)}.pdf`,
          contentType: 'application/pdf',
        })
      created.assertStatus(201)
    }
    const response = await client
      .get(`/api/v1/modules/${module.id}/materials`)
      .cookie(session.name, session.value)

    response.assertStatus(200)
    assert.deepEqual(
      response.body().data.map((material: { title: string; position: number }) => ({
        title: material.title,
        position: material.position,
      })),
      [
        { title: 'Second listed material', position: 0 },
        { title: 'First listed material', position: 1 },
      ]
    )
    const responseText = JSON.stringify(response.body())
    assert.notInclude(responseText, 'storageKey')
    assert.notInclude(responseText, 'storage_key')
    assert.notInclude(responseText.toLowerCase(), 'url')
    assert.notInclude(responseText, 'originals/')
  })

  test('rejects metadata changes when the material belongs to another module', async ({
    assert,
    client,
  }) => {
    const session = await login(client, admin)
    const created = await withCsrf(client.post(`/api/v1/modules/${module.id}/materials`), session)
      .field('title', 'Owned material')
      .file('file', pdfFile, { filename: 'manual.pdf', contentType: 'application/pdf' })
    created.assertStatus(201)
    const materialId = created.body().data.id
    const before = await Material.findOrFail(materialId)
    storageOperations = []

    const response = await withCsrf(
      client.patch(`/api/v1/modules/${secondModule.id}/materials/${materialId}`),
      session
    ).unsafeJson({ title: 'Cross-module edit' })

    response.assertStatus(404)
    assert.deepEqual(storageOperations, [])
    const after = await Material.findOrFail(materialId)
    assert.equal(after.title, before.title)
  })

  test('deletes the private object before metadata and compacts positions', async ({
    assert,
    client,
  }) => {
    const session = await login(client, admin)
    const materials: Material[] = []
    for (const title of ['First material', 'Middle material', 'Last material']) {
      const created = await withCsrf(client.post(`/api/v1/modules/${module.id}/materials`), session)
        .field('title', title)
        .file('file', pdfFile, {
          filename: `${title.split(' ')[0].toLowerCase()}.pdf`,
          contentType: 'application/pdf',
        })
      created.assertStatus(201)
      materials.push(await Material.findOrFail(created.body().data.id))
    }
    storageOperations = []

    const response = await withCsrf(
      client.delete(`/api/v1/modules/${module.id}/materials/${materials[1].id}`),
      session
    )
    response.assertStatus(204)
    assert.deepEqual(storageOperations, [`delete:${materials[1].storageKey}`])
    assert.isFalse(storedKeys.has(materials[1].storageKey))

    const remaining = await Material.query().where('module_id', module.id).orderBy('position')
    assert.deepEqual(
      remaining.map((material) => ({ title: material.title, position: material.position })),
      [
        { title: 'First material', position: 0 },
        { title: 'Last material', position: 1 },
      ]
    )
  })

  test('deletes metadata when the private object is already missing', async ({
    assert,
    client,
  }) => {
    const session = await login(client, admin)
    const created = await withCsrf(client.post(`/api/v1/modules/${module.id}/materials`), session)
      .field('title', 'Missing object material')
      .file('file', pdfFile, { filename: 'missing.pdf', contentType: 'application/pdf' })
    created.assertStatus(201)
    const materialId = created.body().data.id
    const originalDeleteObjectForMissing = MinioStorageProvider.prototype.deleteObject
    MinioStorageProvider.prototype.deleteObject = async () => {
      const error = new Error('NoSuchKey') as Error & { name: string }
      error.name = 'NoSuchKey'
      throw error
    }

    try {
      const response = await withCsrf(
        client.delete(`/api/v1/modules/${module.id}/materials/${materialId}`),
        session
      )
      response.assertStatus(204)
      const deletedMaterial = await Material.find(materialId)
      assert.isNull(deletedMaterial)
    } finally {
      MinioStorageProvider.prototype.deleteObject = originalDeleteObjectForMissing
    }
  })

  test('removes derivative objects and queue metadata before deleting the original', async ({
    assert,
    client,
  }) => {
    const session = await login(client, admin)
    const created = await withCsrf(client.post(`/api/v1/modules/${module.id}/materials`), session)
      .field('title', 'Rendered manual')
      .file('file', pdfFile, { filename: 'rendered.pdf', contentType: 'application/pdf' })
    created.assertStatus(201)
    const material = await Material.findOrFail(created.body().data.id)
    await MaterialDerivative.createMany([
      {
        materialId: material.id,
        kind: 'PDF_PAGE',
        storageKey: `derivatives/${material.id}/run-a/page-1.webp`,
        mimeType: 'image/webp',
        pageNumber: 1,
        width: 100,
        height: 100,
        position: 0,
      },
      {
        materialId: material.id,
        kind: 'PDF_PAGE',
        storageKey: `derivatives/${material.id}/run-a/page-2.webp`,
        mimeType: 'image/webp',
        pageNumber: 2,
        width: 100,
        height: 100,
        position: 1,
      },
    ])
    storedKeys.add(`derivatives/${material.id}/run-a/page-1.webp`)
    storedKeys.add(`derivatives/${material.id}/run-a/page-2.webp`)
    storageOperations = []

    const response = await withCsrf(
      client.delete(`/api/v1/modules/${module.id}/materials/${material.id}`),
      session
    )

    response.assertStatus(204)
    assert.deepEqual(storageOperations, [
      `delete:derivatives/${material.id}/run-a/page-1.webp`,
      `delete:derivatives/${material.id}/run-a/page-2.webp`,
      `delete:${material.storageKey}`,
    ])
    assert.isNull(await ProcessingJob.findBy('material_id', material.id))
    assert.lengthOf(await MaterialDerivative.query().where('material_id', material.id), 0)
    assert.isNull(await Material.find(material.id))
  })

  test('removes a tiled manifest and every object in its private prefix before the original', async ({
    assert,
    client,
  }) => {
    const session = await login(client, admin)
    const created = await withCsrf(client.post(`/api/v1/modules/${module.id}/materials`), session)
      .field('title', 'Tiled manual')
      .file('file', pngFile, { filename: 'tiled.png', contentType: 'image/png' })
    created.assertStatus(201)
    const material = await Material.findOrFail(created.body().data.id)
    const prefix = `derivatives/${material.id}/tile-run/`
    const tileKeys = [`${prefix}tiles/0/0/0.webp`, `${prefix}tiles/1/0/0.webp`]
    await ImageTileManifest.create({
      materialId: material.id,
      storagePrefix: prefix,
      width: 4097,
      height: 257,
      tileSize: 256,
      minLevel: 0,
      maxLevel: 13,
    })
    storedKeys.add(tileKeys[0])
    storedKeys.add(tileKeys[1])
    storageOperations = []

    const response = await withCsrf(
      client.delete(`/api/v1/modules/${module.id}/materials/${material.id}`),
      session
    )

    response.assertStatus(204)
    assert.deepEqual(storageOperations, [
      `delete:${tileKeys[0]}`,
      `delete:${tileKeys[1]}`,
      `delete:${material.storageKey}`,
    ])
    assert.isNull(await ImageTileManifest.findBy('material_id', material.id))
    assert.isFalse(storedKeys.has(tileKeys[0]))
    assert.isFalse(storedKeys.has(tileKeys[1]))
  })

  test('does not keep a published tile manifest after prefix deletion partially fails', async ({
    assert,
    client,
  }) => {
    const session = await login(client, admin)
    const created = await withCsrf(client.post(`/api/v1/modules/${module.id}/materials`), session)
      .field('title', 'Partially deleted tiled manual')
      .file('file', pngFile, { filename: 'partial-tiles.png', contentType: 'image/png' })
    created.assertStatus(201)
    const material = await Material.findOrFail(created.body().data.id)
    const prefix = `derivatives/${material.id}/partial-tile-run/`
    const tileKeys = [`${prefix}tiles/0/0/0.webp`, `${prefix}tiles/1/0/0.webp`]
    await ImageTileManifest.create({
      materialId: material.id,
      storagePrefix: prefix,
      width: 4097,
      height: 257,
      tileSize: 256,
      minLevel: 0,
      maxLevel: 13,
    })
    storedKeys.add(tileKeys[0])
    storedKeys.add(tileKeys[1])
    const deleteObjectBeforeFailure = MinioStorageProvider.prototype.deleteObject
    let deletes = 0
    MinioStorageProvider.prototype.deleteObject = async (key) => {
      deletes += 1
      if (deletes === 2) {
        throw new Error('object storage unavailable')
      }
      storageOperations.push(`delete:${key}`)
      storedKeys.delete(key)
    }

    try {
      const response = await withCsrf(
        client.delete(`/api/v1/modules/${module.id}/materials/${material.id}`),
        session
      )

      response.assertStatus(204)
      assert.isNull(await Material.find(material.id))
      assert.isNull(await ImageTileManifest.findBy('material_id', material.id))
    } finally {
      MinioStorageProvider.prototype.deleteObject = deleteObjectBeforeFailure
    }

    const cleanupTask = await StorageCleanupTask.query().firstOrFail()
    assert.deepEqual(cleanupTask.storagePrefixes, [prefix])
    assert.include(cleanupTask.objectKeys, material.storageKey)
    const worker = new ProcessingWorker({
      jobs: new ProcessingJobService(),
      processor: { async process() {} },
      storage: new MinioStorageProvider(),
    })
    assert.isTrue(await worker.runOnce())
    assert.isNull(await StorageCleanupTask.find(cleanupTask.id))
    assert.isFalse(storedKeys.has(tileKeys[0]))
    assert.isFalse(storedKeys.has(tileKeys[1]))
  })

  test('cleans prefixes and object keys retained by a job when its material is deleted', async ({
    assert,
    client,
  }) => {
    const session = await login(client, admin)
    const created = await withCsrf(client.post(`/api/v1/modules/${module.id}/materials`), session)
      .field('title', 'Reprocessed tiled manual')
      .file('file', pngFile, { filename: 'reprocessed-tiles.png', contentType: 'image/png' })
    created.assertStatus(201)
    const material = await Material.findOrFail(created.body().data.id)
    const job = await ProcessingJob.findByOrFail('material_id', material.id)
    const oldPrefix = `derivatives/${material.id}/former-tile-run/`
    const oldTileKeys = [`${oldPrefix}tiles/0/0/0.webp`, `${oldPrefix}tiles/1/0/0.webp`]
    const pendingKey = `derivatives/${material.id}/former-preview.webp`
    job.merge({
      status: 'SUCCEEDED',
      outputPrefix: oldPrefix,
      pendingCleanupKeys: [pendingKey],
    })
    await job.save()
    storedKeys.add(oldTileKeys[0])
    storedKeys.add(oldTileKeys[1])
    storedKeys.add(pendingKey)
    storageOperations = []

    const response = await withCsrf(
      client.delete(`/api/v1/modules/${module.id}/materials/${material.id}`),
      session
    )

    response.assertStatus(204)
    assert.isFalse(storedKeys.has(oldTileKeys[0]))
    assert.isFalse(storedKeys.has(oldTileKeys[1]))
    assert.isFalse(storedKeys.has(pendingKey))
  })

  test('refuses deletion with access history before removing private objects', async ({
    assert,
    client,
  }) => {
    const session = await login(client, admin)
    const created = await withCsrf(client.post(`/api/v1/modules/${module.id}/materials`), session)
      .field('title', 'Audited manual')
      .file('file', pdfFile, { filename: 'audited.pdf', contentType: 'application/pdf' })
    created.assertStatus(201)
    const material = await Material.findOrFail(created.body().data.id)
    const derivativeKey = `derivatives/${material.id}/run-a/page-1.webp`
    const derivative = await MaterialDerivative.create({
      materialId: material.id,
      kind: 'PDF_PAGE',
      storageKey: derivativeKey,
      mimeType: 'image/webp',
      pageNumber: 1,
      width: 100,
      height: 100,
      position: 0,
    })
    const job = await ProcessingJob.findByOrFail('material_id', material.id)
    const accessLog = await AccessLog.create({
      userId: student.id,
      materialId: material.id,
      action: 'VIEW_MATERIAL',
      ipAddress: '203.0.113.10',
      userAgent: 'Material deletion regression test',
    })
    storedKeys.add(derivativeKey)
    storageOperations = []

    const response = await withCsrf(
      client.delete(`/api/v1/modules/${module.id}/materials/${material.id}`),
      session
    )

    response.assertStatus(409)
    assert.deepEqual(response.body(), {
      message: 'Material cannot be deleted because it has access history',
      code: 'MATERIAL_HAS_ACCESS_LOGS',
    })
    assert.deepEqual(storageOperations, [])
    assert.isTrue(storedKeys.has(material.storageKey))
    assert.isTrue(storedKeys.has(derivativeKey))
    assert.isNotNull(await Material.find(material.id))
    assert.isNotNull(await MaterialDerivative.find(derivative.id))
    assert.isNotNull(await ProcessingJob.find(job.id))
    const persistedAccessLog = await AccessLog.findOrFail(accessLog.id)
    assert.equal(persistedAccessLog.materialId, material.id)
  })

  test('waits for an in-flight access log and then refuses deletion before storage', async ({
    assert,
    client,
  }) => {
    const session = await login(client, admin)
    const created = await withCsrf(client.post(`/api/v1/modules/${module.id}/materials`), session)
      .field('title', 'Concurrently audited manual')
      .file('file', pdfFile, {
        filename: 'concurrently-audited.pdf',
        contentType: 'application/pdf',
      })
    created.assertStatus(201)
    const material = await Material.findOrFail(created.body().data.id)
    storageOperations = []
    const writer = await db.transaction()
    let writerCompleted = false

    try {
      await writer.rawQuery("SET LOCAL lock_timeout = '2s'")
      const accessLog = await AccessLog.create(
        {
          userId: student.id,
          materialId: material.id,
          action: 'VIEW_MATERIAL',
          ipAddress: '203.0.113.11',
          userAgent: 'Concurrent access-log writer',
        },
        { client: writer }
      )
      const deletionResponse = Promise.resolve(
        withCsrf(client.delete(`/api/v1/modules/${module.id}/materials/${material.id}`), session)
      )
      const outcomeBeforeCommit = await Promise.race([
        deletionResponse.then(() => 'settled' as const),
        new Promise<'blocked'>((resolve) => setTimeout(() => resolve('blocked'), 50)),
      ])
      const storageBeforeCommit = [...storageOperations]

      await writer.commit()
      writerCompleted = true
      const response = await deletionResponse

      assert.equal(outcomeBeforeCommit, 'blocked')
      assert.deepEqual(storageBeforeCommit, [])
      response.assertStatus(409)
      response.assertBody({
        message: 'Material cannot be deleted because it has access history',
        code: 'MATERIAL_HAS_ACCESS_LOGS',
      })
      assert.deepEqual(storageOperations, [])
      assert.isTrue(storedKeys.has(material.storageKey))
      assert.isNotNull(await Material.find(material.id))
      const persistedAccessLog = await AccessLog.findOrFail(accessLog.id)
      assert.equal(persistedAccessLog.materialId, material.id)
    } finally {
      if (!writerCompleted) {
        await writer.rollback()
      }
    }
  })

  test('makes a material inaccessible before physical cleanup begins', async ({
    assert,
    client,
  }) => {
    const session = await login(client, admin)
    const created = await withCsrf(client.post(`/api/v1/modules/${module.id}/materials`), session)
      .field('title', 'Concurrently deleted manual')
      .file('file', pdfFile, {
        filename: 'concurrently-deleted.pdf',
        contentType: 'application/pdf',
      })
    created.assertStatus(201)
    const material = await Material.findOrFail(created.body().data.id)
    storageOperations = []
    const deleteObjectBeforeAccessLogRace = MinioStorageProvider.prototype.deleteObject
    let signalDeletionStarted!: () => void
    let allowDeletion!: () => void
    const deletionStarted = new Promise<void>((resolve) => (signalDeletionStarted = resolve))
    const deletionAllowed = new Promise<void>((resolve) => (allowDeletion = resolve))
    MinioStorageProvider.prototype.deleteObject = async (key) => {
      if (key === material.storageKey) {
        signalDeletionStarted()
        await deletionAllowed
      }
      storageOperations.push(`delete:${key}`)
      storedKeys.delete(key)
    }

    const deletionResponse = Promise.resolve(
      withCsrf(client.delete(`/api/v1/modules/${module.id}/materials/${material.id}`), session)
    )
    await deletionStarted
    const writer = await db.transaction()
    let writerCompleted = false

    try {
      await writer.rawQuery("SET LOCAL lock_timeout = '2s'")
      const accessLogOutcome = AccessLog.create(
        {
          userId: student.id,
          materialId: material.id,
          action: 'VIEW_MATERIAL',
          ipAddress: '203.0.113.12',
          userAgent: 'Late concurrent access-log writer',
        },
        { client: writer }
      ).then(
        () => ({ kind: 'created' as const }),
        (error: unknown) => ({ kind: 'rejected' as const, error })
      )
      const outcomeBeforeRelease = await Promise.race([
        accessLogOutcome,
        new Promise<{ kind: 'blocked' }>((resolve) =>
          setTimeout(() => resolve({ kind: 'blocked' }), 50)
        ),
      ])

      allowDeletion()
      const response = await deletionResponse
      const outcomeAfterCommit = await accessLogOutcome
      await writer.rollback()
      writerCompleted = true

      assert.equal(outcomeBeforeRelease.kind, 'rejected')
      response.assertStatus(204)
      assert.equal(outcomeAfterCommit.kind, 'rejected')
      if (outcomeAfterCommit.kind === 'rejected') {
        assert.equal((outcomeAfterCommit.error as { code?: string }).code, '23503')
      }
      assert.deepEqual(storageOperations, [`delete:${material.storageKey}`])
      assert.isFalse(storedKeys.has(material.storageKey))
      assert.isNull(await Material.find(material.id))
      assert.lengthOf(await AccessLog.query().where('material_id', material.id), 0)
    } finally {
      allowDeletion()
      if (!writerCompleted) {
        await writer.rollback()
      }
      await deletionResponse
      MinioStorageProvider.prototype.deleteObject = deleteObjectBeforeAccessLogRace
    }
  })

  test('prevents a derivative from being committed after deletion makes metadata inaccessible', async ({
    assert,
    client,
  }) => {
    const session = await login(client, admin)
    const created = await withCsrf(client.post(`/api/v1/modules/${module.id}/materials`), session)
      .field('title', 'Locked rendered manual')
      .file('file', pdfFile, { filename: 'locked-rendered.pdf', contentType: 'application/pdf' })
    created.assertStatus(201)
    const material = await Material.findOrFail(created.body().data.id)
    const deleteObjectBeforeLifecycleLockTest = MinioStorageProvider.prototype.deleteObject
    let startDeletion!: () => void
    let allowDeletion!: () => void
    const deletionStarted = new Promise<void>((resolve) => (startDeletion = resolve))
    const deletionAllowed = new Promise<void>((resolve) => (allowDeletion = resolve))
    MinioStorageProvider.prototype.deleteObject = async (key) => {
      if (key === material.storageKey) {
        startDeletion()
        await deletionAllowed
      }
      storedKeys.delete(key)
    }

    try {
      const deletionResponse = Promise.resolve(
        withCsrf(client.delete(`/api/v1/modules/${module.id}/materials/${material.id}`), session)
      )
      await deletionStarted
      const derivativeOutcome = db
        .transaction(async (trx) => {
          await MaterialDerivative.create(
            {
              materialId: material.id,
              kind: 'PDF_PAGE',
              storageKey: `derivatives/${material.id}/late/page-1.webp`,
              mimeType: 'image/webp',
              pageNumber: 1,
              width: 100,
              height: 100,
              position: 0,
            },
            { client: trx }
          )
        })
        .then(
          () => 'created',
          () => 'rejected'
        )

      const outcomeBeforeRelease = await Promise.race([
        derivativeOutcome,
        new Promise<'blocked'>((resolve) => setTimeout(() => resolve('blocked'), 50)),
      ])
      assert.equal(outcomeBeforeRelease, 'rejected')

      allowDeletion()
      const deletedResponse = await deletionResponse
      deletedResponse.assertStatus(204)
      assert.equal(await derivativeOutcome, 'rejected')
      assert.isNull(await Material.find(material.id))
      assert.lengthOf(await MaterialDerivative.query().where('material_id', material.id), 0)
    } finally {
      MinioStorageProvider.prototype.deleteObject = deleteObjectBeforeLifecycleLockTest
    }
  })

  test('protects metadata edits and deletes with CSRF and administrator authorization', async ({
    assert,
    client,
  }) => {
    const adminSession = await login(client, admin)
    const created = await withCsrf(
      client.post(`/api/v1/modules/${module.id}/materials`),
      adminSession
    )
      .field('title', 'Protected material')
      .file('file', pdfFile, { filename: 'protected.pdf', contentType: 'application/pdf' })
    created.assertStatus(201)
    const materialId = created.body().data.id

    const missingCsrf = await client
      .patch(`/api/v1/modules/${module.id}/materials/${materialId}`)
      .redirects(0)
      .cookie(adminSession.name, adminSession.value)
      .unsafeJson({ title: 'Missing CSRF' })
    missingCsrf.assertStatus(302)

    const studentSession = await login(client, student)
    const studentDelete = await withCsrf(
      client.delete(`/api/v1/modules/${module.id}/materials/${materialId}`),
      studentSession
    )
    studentDelete.assertStatus(403)
    assert.isNotNull(await Material.find(materialId))
  })

  test('makes concurrent deletes idempotent after one request wins', async ({ assert, client }) => {
    const session = await login(client, admin)
    const created = await withCsrf(client.post(`/api/v1/modules/${module.id}/materials`), session)
      .field('title', 'Concurrent delete material')
      .file('file', pdfFile, { filename: 'concurrent.pdf', contentType: 'application/pdf' })
    created.assertStatus(201)
    const materialId = created.body().data.id
    const path = `/api/v1/modules/${module.id}/materials/${materialId}`

    const responses = await Promise.all([
      withCsrf(client.delete(path), session),
      withCsrf(client.delete(path), session),
    ])

    responses.forEach((response) => response.assertStatus(204))
    const deletedMaterial = await Material.find(materialId)
    assert.isNull(deletedMaterial)
  })
})

async function materialCount() {
  const [row] = await Material.query().count('* as total')
  return Number(row.$extras.total)
}

async function temporaryFiles() {
  const rootFiles = await readdir(tmpdir())
  const privateFiles = await readdir(multipartTmpDirectory).catch(() => [])
  return new Set([
    ...rootFiles.map((file) => `root:${file}`),
    ...privateFiles.map((file) => `private:${file}`),
  ])
}

async function newTemporaryFiles(before: Set<string>) {
  const after = await temporaryFiles()
  return [...after].filter((file) => !before.has(file))
}
