import Course from '#models/course'
import CourseModule from '#models/course_module'
import CourseModuleTransformer from '#transformers/course_module_transformer'
import CourseTransformer from '#transformers/course_transformer'
import {
  createCourseValidator,
  createModuleValidator,
  reorderModulesValidator,
  updateCourseValidator,
  updateModuleValidator,
} from '#validators/course'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { HttpContext } from '@adonisjs/core/http'
import { ValidationError } from '@vinejs/vine'

export default class CoursesController {
  async index({ serialize }: HttpContext) {
    const courses = await Course.query().orderBy('created_at', 'desc').orderBy('id', 'desc')

    return serialize(CourseTransformer.transform(courses))
  }

  async store({ request, response, serialize }: HttpContext) {
    const payload = await request.validateUsing(createCourseValidator)
    const course = await Course.create({ ...payload, status: 'DRAFT' })
    await course.load('modules')

    return response.created(await serializeCourse(course, serialize))
  }

  async show({ params, serialize }: HttpContext) {
    const courseId = parseRouteId(params.id, 'id')
    const course = await Course.findOrFail(courseId)
    await course.load('modules')

    return serializeCourse(course, serialize)
  }

  async update({ params, request, serialize }: HttpContext) {
    const courseId = parseRouteId(params.id, 'id')
    const course = await Course.findOrFail(courseId)
    const payload = await request.validateUsing(updateCourseValidator)

    course.merge(payload)
    await course.save()

    return serialize(CourseTransformer.transform(course))
  }

  async storeModule({ params, request, response, serialize }: HttpContext) {
    const courseId = parseRouteId(params.courseId, 'courseId')
    const payload = await request.validateUsing(createModuleValidator)
    const module = await db.transaction(async (trx) => {
      const course = await lockCourseForUpdate(courseId, trx)
      const modulesCount = await CourseModule.query({ client: trx })
        .where('course_id', course.id)
        .count('* as total')
      const position = Number(modulesCount[0].$extras.total)

      return CourseModule.create({ ...payload, courseId: course.id, position }, { client: trx })
    })

    return response.created(await serialize(CourseModuleTransformer.transform(module)))
  }

  async updateModule({ params, request, serialize }: HttpContext) {
    const courseId = parseRouteId(params.courseId, 'courseId')
    const moduleId = parseRouteId(params.id, 'id')
    const module = await findModuleOrFail(courseId, moduleId)
    const payload = await request.validateUsing(updateModuleValidator)

    module.merge(payload)
    await module.save()

    return serialize(CourseModuleTransformer.transform(module))
  }

  async destroyModule({ params, response }: HttpContext) {
    const courseId = parseRouteId(params.courseId, 'courseId')
    const moduleId = parseRouteId(params.id, 'id')

    await db.transaction(async (trx) => {
      await lockCourseForUpdate(courseId, trx)
      const module = await CourseModule.query({ client: trx })
        .where('course_id', courseId)
        .where('id', moduleId)
        .firstOrFail()
      const modulesCount = await CourseModule.query({ client: trx })
        .where('course_id', courseId)
        .count('* as total')
      const temporaryOffset = Number(modulesCount[0].$extras.total)

      await module.useTransaction(trx).delete()
      if (temporaryOffset > 1) {
        await trx.rawQuery(
          'UPDATE modules SET position = position + ?, updated_at = CURRENT_TIMESTAMP WHERE course_id = ? AND position > ?',
          [temporaryOffset, courseId, module.position]
        )
        await trx.rawQuery(
          'UPDATE modules SET position = position - ?, updated_at = CURRENT_TIMESTAMP WHERE course_id = ? AND position > ?',
          [temporaryOffset + 1, courseId, module.position + temporaryOffset]
        )
      }
    })

    return response.noContent()
  }

  async reorderModules({ params, request, serialize }: HttpContext) {
    const courseId = parseRouteId(params.courseId, 'courseId')
    const { moduleIds } = await request.validateUsing(reorderModulesValidator)

    await db.transaction(async (trx) => {
      const course = await lockCourseForUpdate(courseId, trx)
      const modules = await CourseModule.query({ client: trx })
        .where('course_id', course.id)
        .orderBy('position')

      if (
        modules.length !== moduleIds.length ||
        !moduleIds.every((moduleId) => modules.some((module) => module.id === moduleId))
      ) {
        throw invalidModuleOrder()
      }

      if (moduleIds.length > 0) {
        await trx.rawQuery(
          'UPDATE modules SET position = position + ?, updated_at = CURRENT_TIMESTAMP WHERE course_id = ?',
          [modules.length, course.id]
        )
        const cases = moduleIds.map((_, index) => `WHEN ? THEN ${index}`).join(' ')
        await trx.rawQuery(
          `UPDATE modules SET position = CASE id ${cases} END, updated_at = CURRENT_TIMESTAMP WHERE course_id = ?`,
          [...moduleIds, course.id]
        )
      }
    })

    const course = await Course.findOrFail(courseId)
    await course.load('modules')
    return serializeCourse(course, serialize)
  }
}

async function findModuleOrFail(courseId: number, id: number) {
  return CourseModule.query().where('course_id', courseId).where('id', id).firstOrFail()
}

async function lockCourseForUpdate(courseId: number, trx: TransactionClientContract) {
  return Course.query({ client: trx }).where('id', courseId).forUpdate().firstOrFail()
}

function parseRouteId(value: string, field: string) {
  const id = Number(value)
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(id) || id > 2_147_483_647) {
    throw new ValidationError([
      {
        message: `The ${field} field must be a valid numeric ID`,
        rule: 'number',
        field,
      },
    ])
  }

  return id
}

function invalidModuleOrder() {
  return new ValidationError([
    {
      message: 'The module IDs must exactly match the modules in this course',
      rule: 'moduleIds',
      field: 'moduleIds',
    },
  ])
}

function serializeCourse(course: Course, serialize: HttpContext['serialize']) {
  return serialize({
    ...new CourseTransformer(course).toObject(),
    modules: CourseModuleTransformer.transform(course.modules),
  })
}
