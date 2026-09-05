import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'materials'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('module_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('modules')
        .onDelete('CASCADE')
      table.string('title', 160).notNullable()
      table.text('description').nullable()
      table.enum('type', ['PDF', 'IMAGE', 'ZIP']).notNullable()
      table.string('storage_key', 1024).notNullable().unique()
      table.string('original_filename', 1024).notNullable()
      table.string('mime_type', 255).notNullable()
      table.integer('size').notNullable()
      table.integer('position').unsigned().notNullable()
      table.enum('processing_status', ['UPLOADING', 'PROCESSING', 'READY', 'FAILED']).notNullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.check('size >= 0')
      table.check('position >= 0')
      table.unique(['module_id', 'position'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
