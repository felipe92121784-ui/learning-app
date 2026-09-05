import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'processing_jobs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('material_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('materials')
        .onDelete('CASCADE')
      table.enum('kind', ['PDF_RENDER', 'IMAGE_DERIVATIVE']).notNullable()
      table.enum('status', ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED']).notNullable()
      table.integer('attempts').unsigned().notNullable().defaultTo(0)
      table.integer('max_attempts').unsigned().notNullable().defaultTo(3)
      table.timestamp('locked_at').nullable()
      table.timestamp('lease_expires_at').nullable()
      table.string('last_error_code', 64).nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.check('attempts BETWEEN 0 AND max_attempts')
      table.check('max_attempts = 3')
    })
    this.schema.raw(
      "CREATE UNIQUE INDEX processing_jobs_one_active_per_material ON processing_jobs (material_id) WHERE status IN ('PENDING', 'RUNNING')"
    )
    this.schema.raw(
      "ALTER TABLE processing_jobs ADD CONSTRAINT processing_jobs_safe_error_code_check CHECK (last_error_code IS NULL OR last_error_code IN ('PDF_PAGE_LIMIT_EXCEEDED', 'ORIGINAL_NOT_FOUND', 'INVALID_INPUT', 'STORAGE_ERROR', 'PROCESSING_ERROR'))"
    )
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
