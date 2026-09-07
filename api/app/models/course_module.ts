import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'
import Course from '#models/course'
import Material from '#models/material'
import AccessRule from '#models/access_rule'

export default class CourseModule extends BaseModel {
  static table = 'modules'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare courseId: number

  @column()
  declare title: string

  @column()
  declare description: string | null

  @column()
  declare position: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @belongsTo(() => Course)
  declare course: BelongsTo<typeof Course>

  @hasMany(() => Material, {
    foreignKey: 'moduleId',
    onQuery: (query) => query.orderBy('position', 'asc'),
  })
  declare materials: HasMany<typeof Material>

  @hasMany(() => AccessRule, {
    foreignKey: 'resourceId',
    onQuery: (query) => query.where('resource_type', 'MODULE'),
  })
  declare accessRules: HasMany<typeof AccessRule>
}
