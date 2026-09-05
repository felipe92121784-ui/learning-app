import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'materials'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('processing_error_code', 64).nullable()
    })
    this.schema.raw(
      "ALTER TABLE materials ADD CONSTRAINT materials_processing_error_code_check CHECK (processing_error_code IS NULL OR processing_error_code IN ('PDF_PAGE_LIMIT_EXCEEDED', 'ORIGINAL_NOT_FOUND', 'INVALID_INPUT', 'STORAGE_ERROR', 'PROCESSING_ERROR'))"
    )
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('processing_error_code')
    })
  }
}
