import { BaseTransformer } from '@adonisjs/core/transformers'
import type CourseModule from '#models/course_module'

export default class CourseModuleTransformer extends BaseTransformer<CourseModule> {
  toObject() {
    return this.pick(this.resource, [
      'id',
      'courseId',
      'title',
      'description',
      'position',
      'createdAt',
      'updatedAt',
    ])
  }
}
