import AccessRule, {
  ACCESS_RESOURCE_TYPES,
  type AccessCapability,
  type AccessResourceType,
} from '#models/access_rule'
import Course from '#models/course'
import CourseModule from '#models/course_module'
import Material from '#models/material'
import type { DateTime } from 'luxon'

export interface ResolveAccessInput {
  userId: number
  resourceType: AccessResourceType
  resourceId: number
  capability: AccessCapability
  now: DateTime
}

export interface AccessResourceTarget {
  resourceType: AccessResourceType
  resourceId: number
}

export interface AccessDecision {
  allowed: boolean
  decision: 'ALLOW' | 'DENY'
  source: AccessResourceType | 'DEFAULT'
  ruleId: number | null
}

export class AccessResourceNotFoundError extends Error {
  constructor(label: string, id: number) {
    super(`${label} ${id} does not exist`)
    this.name = 'AccessResourceNotFoundError'
  }
}

interface ResourceInChain {
  type: AccessResourceType
  id: number
}

export default class AccessControlService {
  async resolve(input: ResolveAccessInput): Promise<AccessDecision> {
    const chain = await this.resourceChain(input.resourceType, input.resourceId)

    for (const resource of chain) {
      const rule = await AccessRule.query()
        .where({
          userId: input.userId,
          resourceType: resource.type,
          resourceId: resource.id,
          capability: input.capability,
        })
        .first()

      if (!rule || !this.isValidAt(rule, input.now) || rule.effect === 'INHERIT') {
        continue
      }

      return {
        allowed: rule.effect === 'ALLOW',
        decision: rule.effect,
        source: resource.type,
        ruleId: rule.id,
      }
    }

    return { allowed: false, decision: 'DENY', source: 'DEFAULT', ruleId: null }
  }

  async validateTarget(target: AccessResourceTarget): Promise<void> {
    await this.resourceChain(target.resourceType, target.resourceId)
  }

  private isValidAt(rule: AccessRule, now: DateTime): boolean {
    return (
      (!rule.startsAt || rule.startsAt.toMillis() <= now.toMillis()) &&
      (!rule.expiresAt || now.toMillis() < rule.expiresAt.toMillis())
    )
  }

  private async resourceChain(
    resourceType: AccessResourceType,
    resourceId: number
  ): Promise<ResourceInChain[]> {
    if (!ACCESS_RESOURCE_TYPES.includes(resourceType)) {
      throw new Error(`Unknown access rule resource type: ${resourceType}`)
    }

    if (resourceType === 'COURSE') {
      const course = await Course.find(resourceId)
      if (!course) {
        this.resourceDoesNotExist('Course', resourceId)
      }
      return [{ type: 'COURSE', id: resourceId }]
    }

    if (resourceType === 'MODULE') {
      const module = await CourseModule.find(resourceId)
      if (!module) {
        this.resourceDoesNotExist('Module', resourceId)
      }
      const course = await Course.find(module.courseId)
      if (!course) {
        this.resourceDoesNotExist('Course', module.courseId)
      }
      return [
        { type: 'MODULE', id: module.id },
        { type: 'COURSE', id: module.courseId },
      ]
    }

    const material = await Material.find(resourceId)
    if (!material) {
      this.resourceDoesNotExist('Material', resourceId)
    }
    const module = await CourseModule.find(material.moduleId)
    if (!module) {
      this.resourceDoesNotExist('Module', material.moduleId)
    }
    const course = await Course.find(module.courseId)
    if (!course) {
      this.resourceDoesNotExist('Course', module.courseId)
    }
    return [
      { type: 'MATERIAL', id: material.id },
      { type: 'MODULE', id: module.id },
      { type: 'COURSE', id: module.courseId },
    ]
  }

  private resourceDoesNotExist(label: string, id: number): never {
    throw new AccessResourceNotFoundError(label, id)
  }
}
