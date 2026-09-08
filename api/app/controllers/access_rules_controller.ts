import AccessRule from '#models/access_rule'
import CourseModule from '#models/course_module'
import Material from '#models/material'
import User from '#models/user'
import AccessControlService, { AccessResourceNotFoundError } from '#services/access_control_service'
import AccessRuleTransformer from '#transformers/access_rule_transformer'
import {
  accessRuleIdValidator,
  accessRuleTargetValidator,
  fieldError,
  parseAccessRuleWindow,
  upsertAccessRuleValidator,
} from '#validators/access_rule'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'

export default class AccessRulesController {
  private accessControl = new AccessControlService()

  async index({ request, serialize }: HttpContext) {
    const target = await accessRuleTargetValidator.validate(request.qs())
    await this.ensureStudent(target.userId)
    await this.ensureTarget(target)

    const rules = await AccessRule.query()
      .where({
        userId: target.userId,
        resourceType: target.resourceType,
        resourceId: target.resourceId,
      })
      .orderBy('capability', 'asc')

    return serialize(AccessRuleTransformer.transform(rules))
  }

  async upsert({ request, serialize }: HttpContext) {
    const payload = await request.validateUsing(upsertAccessRuleValidator)
    const window = parseAccessRuleWindow(payload.startsAt, payload.expiresAt)
    await this.ensureStudent(payload.userId)
    await this.ensureTarget(payload)
    await this.ensureChildTargetHasCourseAssociation(payload.userId, payload)

    const now = DateTime.utc().toSQL()!
    const [row] = await db
      .table('access_rules')
      .insert({
        user_id: payload.userId,
        resource_type: payload.resourceType,
        resource_id: payload.resourceId,
        capability: payload.capability,
        effect: payload.effect,
        starts_at: window.startsAt?.toSQL() ?? null,
        expires_at: window.expiresAt?.toSQL() ?? null,
        created_at: now,
        updated_at: now,
      })
      .onConflict(['user_id', 'resource_type', 'resource_id', 'capability'])
      .merge({
        effect: payload.effect,
        starts_at: window.startsAt?.toSQL() ?? null,
        expires_at: window.expiresAt?.toSQL() ?? null,
        updated_at: now,
      })
      .returning('id')
    const rule = await AccessRule.findOrFail(row.id)

    return serialize(AccessRuleTransformer.transform(rule))
  }

  async destroy({ params, response }: HttpContext) {
    const { id } = await accessRuleIdValidator.validate(params)
    const rule = await AccessRule.find(id)
    if (rule) {
      await rule.delete()
    }

    return response.noContent()
  }

  async effective({ request, serialize }: HttpContext) {
    const target = await accessRuleTargetValidator.validate(request.qs())
    await this.ensureStudent(target.userId)
    await this.ensureTarget(target)

    const now = DateTime.utc()
    const [view, download] = await Promise.all([
      this.accessControl.resolve({ ...target, capability: 'VIEW', now }),
      this.accessControl.resolve({ ...target, capability: 'DOWNLOAD', now }),
    ])

    return serialize({ view, download })
  }

  private async ensureStudent(userId: number) {
    const user = await User.find(userId)
    if (!user || user.role !== 'STUDENT') {
      throw fieldError('userId', 'The userId field must identify an existing student')
    }
  }

  private async ensureTarget(target: {
    resourceType: 'COURSE' | 'MODULE' | 'MATERIAL'
    resourceId: number
  }) {
    try {
      await this.accessControl.validateTarget(target)
    } catch (error) {
      if (error instanceof AccessResourceNotFoundError) {
        throw fieldError('resourceId', 'The resourceId field must identify an existing resource')
      }

      throw error
    }
  }

  private async ensureChildTargetHasCourseAssociation(
    userId: number,
    target: {
      resourceType: 'COURSE' | 'MODULE' | 'MATERIAL'
      resourceId: number
    }
  ) {
    const courseId = await this.courseIdForChildTarget(target)
    if (!courseId) return

    const association = await AccessRule.query()
      .where({ userId, resourceType: 'COURSE', resourceId: courseId })
      .first()

    if (!association) {
      throw fieldError(
        'resourceId',
        'The resourceId field must belong to a course currently assigned to the student'
      )
    }
  }

  private async courseIdForChildTarget(target: {
    resourceType: 'COURSE' | 'MODULE' | 'MATERIAL'
    resourceId: number
  }): Promise<number | null> {
    if (target.resourceType === 'COURSE') return null

    if (target.resourceType === 'MODULE') {
      const module = await CourseModule.findOrFail(target.resourceId)
      return module.courseId
    }

    const material = await Material.findOrFail(target.resourceId)
    const module = await CourseModule.findOrFail(material.moduleId)
    return module.courseId
  }
}
