import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'
import CourseModule from '#models/course_module'
import AccessRule from '#models/access_rule'

export const COURSE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const
export type CourseStatus = (typeof COURSE_STATUSES)[number]

export default class Course extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare title: string

  @column()
  declare description: string | null

  @column()
  declare status: CourseStatus

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @hasMany(() => CourseModule, {
    onQuery: (query) => query.orderBy('position', 'asc'),
  })
  declare modules: HasMany<typeof CourseModule>

  @hasMany(() => AccessRule, {
    foreignKey: 'resourceId',
    onQuery: (query) => query.where('resource_type', 'COURSE'),
  })
  declare accessRules: HasMany<typeof AccessRule>
}
