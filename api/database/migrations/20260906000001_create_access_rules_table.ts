import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'access_rules'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table.enum('resource_type', ['COURSE', 'MODULE', 'MATERIAL']).notNullable()
      table.integer('resource_id').unsigned().notNullable()
      table.enum('capability', ['VIEW', 'DOWNLOAD']).notNullable()
      table.enum('effect', ['ALLOW', 'DENY', 'INHERIT']).notNullable()
      table.timestamp('starts_at', { useTz: true }).nullable()
      table.timestamp('expires_at', { useTz: true }).nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).nullable()
      table.unique(['user_id', 'resource_type', 'resource_id', 'capability'])
      table.check('expires_at IS NULL OR starts_at IS NULL OR expires_at > starts_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
