import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'modules'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('course_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('courses')
        .onDelete('CASCADE')
      table.string('title', 160).notNullable()
      table.text('description').nullable()
      table.integer('position').unsigned().notNullable()
      table.check('position >= 0')
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.unique(['course_id', 'position'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
