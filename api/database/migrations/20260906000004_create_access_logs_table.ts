import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'access_logs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('RESTRICT')
      table
        .integer('material_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('materials')
        .onDelete('RESTRICT')
      table.string('action', 32).notNullable()
      table.string('ip_address', 45).nullable()
      table.string('user_agent', 512).nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.check("action IN ('VIEW_MATERIAL', 'DOWNLOAD_MATERIAL', 'FAILED_ACCESS')")
      table.index(['material_id', 'created_at'])
      table.index(['user_id', 'created_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
