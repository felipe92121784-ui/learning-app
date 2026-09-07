import Course from '#models/course'
import CourseModule from '#models/course_module'
import ImageTileManifest from '#models/image_tile_manifest'
import Material from '#models/material'
import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'

test.group('ImageTileManifest', (group) => {
  let cleanupDatabase: () => Promise<void>

  group.each.setup(async () => {
    cleanupDatabase = await testUtils.db().truncate()
    await cleanupDatabase()
  })

  group.each.teardown(async () => {
    await cleanupDatabase()
  })

  test('keeps one manifest per material and omits the private storage prefix from JSON', async ({
    assert,
  }) => {
    const material = await createImageMaterial()
    const manifest = await ImageTileManifest.create({
      materialId: material.id,
      storagePrefix: `derivatives/${material.id}/run/tiles`,
      width: 4097,
      height: 257,
      tileSize: 256,
      minLevel: 0,
      maxLevel: 13,
    })

    assert.deepEqual(manifest.serialize(), {
      id: manifest.id,
      materialId: material.id,
      width: 4097,
      height: 257,
      tileSize: 256,
      minLevel: 0,
      maxLevel: 13,
      createdAt: manifest.createdAt.toISO(),
      updatedAt: manifest.updatedAt?.toISO() ?? null,
    })

    await assert.rejects(() =>
      ImageTileManifest.create({
        materialId: material.id,
        storagePrefix: `derivatives/${material.id}/different-run/tiles`,
        width: 4097,
        height: 257,
        tileSize: 256,
        minLevel: 0,
        maxLevel: 13,
      })
    )
  })
})

async function createImageMaterial() {
  const course = await Course.create({ title: 'Tile manifest course' })
  const courseModule = await CourseModule.create({
    courseId: course.id,
    title: 'Tile manifest module',
    position: 0,
  })

  return Material.create({
    moduleId: courseModule.id,
    title: 'Tiled image',
    type: 'IMAGE',
    storageKey: 'originals/tiled-image.png',
    originalFilename: 'tiled-image.png',
    mimeType: 'image/png',
    size: 4097,
    position: 0,
    processingStatus: 'PROCESSING',
  })
}
