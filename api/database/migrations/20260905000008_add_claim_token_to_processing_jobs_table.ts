import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'processing_jobs'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.uuid('claim_token').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('claim_token')
    })
  }
}
