import Course from '#models/course'
import type CourseModule from '#models/course_module'
import type Material from '#models/material'
import AccessControlService, {
  type AccessDecision,
  AccessResourceNotFoundError,
  type ResolveAccessInput,
} from '#services/access_control_service'
import { DateTime } from 'luxon'

export type StudentAvailability = 'AVAILABLE' | 'LOCKED' | 'UNAVAILABLE'
export type StudentUnavailableReason = 'PROCESSING' | 'FAILED'

export interface StudentCourseSummary {
  id: number
  title: string
  description: string | null
  moduleCount: number
}

export interface StudentMaterial {
  id: number
  title: string
  description: string | null
  type: 'PDF' | 'IMAGE' | 'ZIP'
  availability: StudentAvailability
  unavailableReason?: StudentUnavailableReason
}

export interface StudentCourseModule {
  id: number
  title: string
  description: string | null
  availability: 'AVAILABLE' | 'LOCKED'
  materials: StudentMaterial[]
}

export interface StudentCourseDetail extends StudentCourseSummary {
  modules: StudentCourseModule[]
}

export interface StudentCatalogAccessControl {
  resolve(input: ResolveAccessInput): Promise<AccessDecision>
}

export class StudentCatalogNotFoundError extends Error {
  constructor() {
    super('Student course not found')
    this.name = 'StudentCatalogNotFoundError'
  }
}

interface StudentCatalogServiceOptions {
  accessControl?: StudentCatalogAccessControl
}

interface TreeDecisions {
  course: AccessDecision
  modules: Map<number, AccessDecision>
  materials: Map<number, AccessDecision>
}

interface ResolvedCourse {
  course: Course
  decisions: TreeDecisions
}

export default class StudentCatalogService {
  private accessControl: StudentCatalogAccessControl

  constructor(options: StudentCatalogServiceOptions = {}) {
    this.accessControl = options.accessControl ?? new AccessControlService()
  }

  async listCourses(input: { userId: number }): Promise<StudentCourseSummary[]> {
    const now = DateTime.utc()
    const courses = await this.publishedCoursesQuery()
    const result: StudentCourseSummary[] = []

    for (const course of courses) {
      const resolved = await this.resolveCourse(input.userId, course, now)
      if (resolved && this.isReachable(resolved.decisions)) {
        result.push(this.toSummary(resolved.course))
      }
    }

    return result
  }

  async getCourse(input: { userId: number; courseId: number }): Promise<StudentCourseDetail> {
    const now = DateTime.utc()
    const course = await this.publishedCoursesQuery().where('id', input.courseId).first()
    if (!course) {
      throw new StudentCatalogNotFoundError()
    }

    const resolved = await this.resolveCourse(input.userId, course, now)
    if (!resolved || !this.isReachable(resolved.decisions)) {
      throw new StudentCatalogNotFoundError()
    }

    return {
      ...this.toSummary(resolved.course),
      modules: resolved.course.modules.map((module) => this.toModule(module, resolved.decisions)),
    }
  }

  private publishedCoursesQuery() {
    return Course.query()
      .where('status', 'PUBLISHED')
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .preload('modules', (modulesQuery) => {
        modulesQuery.orderBy('position', 'asc').preload('materials', (materialsQuery) => {
          materialsQuery.orderBy('position', 'asc')
        })
      })
  }

  private async resolveCourse(
    userId: number,
    course: Course,
    now: DateTime
  ): Promise<ResolvedCourse | null> {
    let snapshot = course

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return { course: snapshot, decisions: await this.resolveTree(userId, snapshot, now) }
      } catch (error) {
        if (!(error instanceof AccessResourceNotFoundError)) {
          throw error
        }
        if (attempt === 1) {
          return null
        }

        const refreshed = await this.publishedCoursesQuery().where('id', snapshot.id).first()
        if (!refreshed) {
          return null
        }
        snapshot = refreshed
      }
    }

    return null
  }

  private async resolveTree(userId: number, course: Course, now: DateTime): Promise<TreeDecisions> {
    const courseDecision = await this.accessControl.resolve({
      userId,
      resourceType: 'COURSE',
      resourceId: course.id,
      capability: 'VIEW',
      now,
    })
    const modules = new Map<number, AccessDecision>()
    const materials = new Map<number, AccessDecision>()

    for (const module of course.modules) {
      modules.set(
        module.id,
        await this.accessControl.resolve({
          userId,
          resourceType: 'MODULE',
          resourceId: module.id,
          capability: 'VIEW',
          now,
        })
      )

      for (const material of module.materials) {
        materials.set(
          material.id,
          await this.accessControl.resolve({
            userId,
            resourceType: 'MATERIAL',
            resourceId: material.id,
            capability: 'VIEW',
            now,
          })
        )
      }
    }

    return { course: courseDecision, modules, materials }
  }

  private isReachable(decisions: TreeDecisions) {
    return (
      decisions.course.allowed ||
      [...decisions.modules.values()].some((decision) => decision.allowed) ||
      [...decisions.materials.values()].some((decision) => decision.allowed)
    )
  }

  private toSummary(course: Course): StudentCourseSummary {
    return {
      id: course.id,
      title: course.title,
      description: course.description,
      moduleCount: course.modules.length,
    }
  }

  private toModule(module: CourseModule, decisions: TreeDecisions): StudentCourseModule {
    const moduleAvailable =
      decisions.modules.get(module.id)?.allowed === true ||
      module.materials.some((material) => decisions.materials.get(material.id)?.allowed === true)

    return {
      id: module.id,
      title: module.title,
      description: module.description,
      availability: moduleAvailable ? 'AVAILABLE' : 'LOCKED',
      materials: module.materials.map((material) => this.toMaterial(material, decisions)),
    }
  }

  private toMaterial(material: Material, decisions: TreeDecisions): StudentMaterial {
    if (decisions.materials.get(material.id)?.allowed !== true) {
      return this.materialBase(material, 'LOCKED')
    }
    if (material.processingStatus === 'READY') {
      return this.materialBase(material, 'AVAILABLE')
    }

    return {
      ...this.materialBase(material, 'UNAVAILABLE'),
      unavailableReason: material.processingStatus === 'FAILED' ? 'FAILED' : 'PROCESSING',
    }
  }

  private materialBase(material: Material, availability: StudentAvailability): StudentMaterial {
    return {
      id: material.id,
      title: material.title,
      description: material.description,
      type: material.type,
      availability,
    }
  }
}
