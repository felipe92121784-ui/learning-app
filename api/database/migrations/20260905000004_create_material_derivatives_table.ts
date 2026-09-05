import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'material_derivatives'

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
      table.enum('kind', ['PDF_PAGE', 'IMAGE_PREVIEW']).notNullable()
      table.string('storage_key', 1024).notNullable()
      table.string('mime_type', 255).notNullable()
      table.integer('page_number').unsigned().nullable()
      table.integer('width').unsigned().notNullable()
      table.integer('height').unsigned().notNullable()
      table.integer('position').unsigned().notNullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.check(
        "(kind = 'PDF_PAGE' AND page_number IS NOT NULL AND page_number >= 1) OR (kind = 'IMAGE_PREVIEW' AND page_number IS NULL)"
      )
      table.check("mime_type = 'image/webp'")
      table.check('width >= 1')
      table.check('height >= 1')
      table.check('position >= 0')
      table.unique(['material_id', 'kind', 'page_number'])
    })
    this.schema.raw(
      "CREATE UNIQUE INDEX material_derivatives_one_image_preview_per_material ON material_derivatives (material_id, kind) WHERE kind = 'IMAGE_PREVIEW' AND page_number IS NULL"
    )
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
