import Course from '#models/course'
import CourseModule from '#models/course_module'
import Material from '#models/material'
import User from '#models/user'
import AccessLogService from '#services/access_log_service'
import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'

test.group('AccessLogService', (group) => {
  let cleanupDatabase: () => Promise<void>

  group.each.setup(async () => {
    cleanupDatabase = await testUtils.db().truncate()
    await cleanupDatabase()
  })

  group.each.teardown(async () => {
    await cleanupDatabase()
  })

  test('records only the approved access-log fields', async ({ assert }) => {
    const { user, material } = await createAccessLogTarget()
    const service = new AccessLogService()

    const log = await service.record({
      userId: user.id,
      materialId: material.id,
      action: 'VIEW_MATERIAL',
      ipAddress: '203.0.113.10',
      userAgent: 'Ideal Learning test agent',
    })

    assert.equal(log.action, 'VIEW_MATERIAL')
    assert.equal(log.materialId, material.id)
    assert.equal(log.userId, user.id)
    assert.equal(log.ipAddress, '203.0.113.10')
    assert.equal(log.userAgent, 'Ideal Learning test agent')
  })

  test('normalizes valid IPs and safely bounds untrusted audit metadata', async ({ assert }) => {
    const { user, material } = await createAccessLogTarget()
    const service = new AccessLogService()
    const longUserAgent = `Ideal Learning/${'x'.repeat(600)}`

    const ipv6Log = await service.record({
      userId: user.id,
      materialId: material.id,
      action: 'DOWNLOAD_MATERIAL',
      ipAddress: ' 2001:DB8:0:0:0:0:0:1 ',
      userAgent: longUserAgent,
    })
    const invalidIpLog = await service.record({
      userId: user.id,
      materialId: material.id,
      action: 'FAILED_ACCESS',
      ipAddress: 'not-an-ip',
      userAgent: null,
    })
    const absentMetadataLog = await service.record({
      userId: user.id,
      materialId: material.id,
      action: 'FAILED_ACCESS',
      ipAddress: undefined,
      userAgent: undefined,
    })

    assert.equal(ipv6Log.ipAddress, '2001:db8::1')
    assert.lengthOf(ipv6Log.userAgent!, 512)
    assert.isNull(invalidIpLog.ipAddress)
    assert.isNull(invalidIpLog.userAgent)
    assert.isNull(absentMetadataLog.ipAddress)
    assert.isNull(absentMetadataLog.userAgent)
  })

  test('database rejects attempts to update or delete audit records', async ({ assert }) => {
    const { user, material } = await createAccessLogTarget()
    const log = await new AccessLogService().record({
      userId: user.id,
      materialId: material.id,
      action: 'VIEW_MATERIAL',
      ipAddress: '203.0.113.10',
      userAgent: 'Ideal Learning test agent',
    })

    const updateError = await captureRejection(() =>
      AccessLog.query().where('id', log.id).update({ action: 'DOWNLOAD_MATERIAL' })
    )
    const deleteError = await captureRejection(() => log.delete())

    assert.include(updateError.message, 'access_logs is append-only')
    assert.include(deleteError.message, 'access_logs is append-only')
    await log.refresh()
    assert.equal(log.action, 'VIEW_MATERIAL')
  })
})

async function createAccessLogTarget() {
  const user = await User.create({
    email: 'access-log@example.test',
    password: 'access-log-password',
    role: 'STUDENT',
    status: 'ACTIVE',
  })
  const course = await Course.create({ title: 'Access log course' })
  const module = await CourseModule.create({
    courseId: course.id,
    title: 'Access log module',
    position: 0,
  })
  const material = await Material.create({
    moduleId: module.id,
    title: 'Access log material',
    type: 'PDF',
    storageKey: 'originals/access-log.pdf',
    originalFilename: 'access-log.pdf',
    mimeType: 'application/pdf',
    size: 10,
    position: 0,
    processingStatus: 'READY',
  })

  return { user, material }
}

async function captureRejection(action: () => Promise<unknown>) {
  try {
    await action()
  } catch (error) {
    return error as Error
  }

  throw new Error('Expected database mutation to be rejected')
}
import AccessLog from '#models/access_log'
