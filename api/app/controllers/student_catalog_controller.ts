import StudentCatalogService, {
  StudentCatalogNotFoundError,
} from '#services/student_catalog_service'
import type { HttpContext } from '@adonisjs/core/http'
import { ValidationError } from '@vinejs/vine'

export default class StudentCatalogController {
  private catalog = new StudentCatalogService()

  async index({ auth }: HttpContext) {
    const courses = await this.catalog.listCourses({
      userId: auth.use('web').getUserOrFail().id,
    })
    return { data: courses }
  }

  async show({ auth, params, response, serialize }: HttpContext) {
    try {
      const course = await this.catalog.getCourse({
        userId: auth.use('web').getUserOrFail().id,
        courseId: parseRouteId(params.id),
      })
      return serialize(course)
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error
      }
      if (error instanceof StudentCatalogNotFoundError) {
        return response.notFound({ message: 'Course not found' })
      }
      throw error
    }
  }
}

function parseRouteId(value: string) {
  const id = Number(value)
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(id) || id > 2_147_483_647) {
    throw new ValidationError([
      {
        message: 'The id field must be a valid numeric ID',
        rule: 'number',
        field: 'id',
      },
    ])
  }
  return id
}
