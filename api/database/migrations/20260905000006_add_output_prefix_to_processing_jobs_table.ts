import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'processing_jobs'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('output_prefix', 1024).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('output_prefix')
    })
  }
}
