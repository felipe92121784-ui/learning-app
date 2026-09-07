import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'processing_jobs'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.jsonb('pending_cleanup_keys').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('pending_cleanup_keys')
    })
  }
}
