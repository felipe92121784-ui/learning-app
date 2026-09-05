import { BaseTransformer } from '@adonisjs/core/transformers'
import type Course from '#models/course'

export default class CourseTransformer extends BaseTransformer<Course> {
  toObject() {
    return this.pick(this.resource, [
      'id',
      'title',
      'description',
      'status',
      'createdAt',
      'updatedAt',
    ])
  }
}
