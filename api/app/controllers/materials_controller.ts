import CourseModule from '#models/course_module'
import AccessLog from '#models/access_log'
import Material, { type MaterialType } from '#models/material'
import MaterialDerivative from '#models/material_derivative'
import ImageTileManifest from '#models/image_tile_manifest'
import ProcessingJobService from '#services/processing_job_service'
import UploadSetting from '#models/upload_setting'
import MinioStorageProvider from '#services/minio_storage_provider'
import MaterialTransformer from '#transformers/material_transformer'
import {
  createMaterialValidator,
  updateMaterialValidator,
  validateMaterialFile,
} from '#validators/material'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { ValidationError } from '@vinejs/vine'
import { createReadStream } from 'node:fs'
import { randomUUID } from 'node:crypto'

export default class MaterialsController {
  private storage = new MinioStorageProvider()
  private processingJobs = new ProcessingJobService()

  async index({ params, serialize }: HttpContext) {
    const moduleId = parseRouteId(params.moduleId, 'moduleId')
    await CourseModule.findOrFail(moduleId)
    const materials = await Material.query().where('module_id', moduleId).orderBy('position', 'asc')

    return serialize(MaterialTransformer.transform(materials))
  }

  async store({ params, request, response, serialize, logger }: HttpContext) {
    const multipartFile = request.file('file')

    const moduleId = parseRouteId(params.moduleId, 'moduleId')
    await CourseModule.findOrFail(moduleId)
    const payload = await request.validateUsing(createMaterialValidator)
    const file = await validateMaterialFile(multipartFile, configuredLimit)
    const storageKey = `originals/${randomUUID()}`

    let body: ReturnType<typeof createReadStream> | undefined
    try {
      await this.storage.ensurePrivateBucket()
      body = createReadStream(file.tmpPath)
      body.on('error', () => undefined)
      await this.storage.putObject({
        key: storageKey,
        body,
        contentType: file.mimeType,
      })
      body.destroy()
    } catch (error) {
      body?.destroy()
      logger.error({ err: error }, 'Unable to write private material object')
      return response.internalServerError({ message: 'Unable to store material' })
    }

    let material: Material
    try {
      material = await db.transaction(async (trx) => {
        await lockModuleForUpdate(moduleId, trx)
        const [positionRow] = await Material.query({ client: trx })
          .where('module_id', moduleId)
          .max('position as finalPosition')
        const position = Number(positionRow.$extras.finalPosition ?? -1) + 1

        const createdMaterial = await Material.create(
          {
            moduleId,
            title: payload.title,
            description: payload.description ?? null,
            type: file.type,
            storageKey,
            originalFilename: file.originalFilename,
            mimeType: file.mimeType,
            size: file.size,
            position,
            processingStatus: 'PROCESSING',
          },
          { client: trx }
        )
        await this.processingJobs.enqueueForMaterial(trx, createdMaterial)
        return createdMaterial
      })
    } catch (error) {
      try {
        await this.storage.deleteObject(storageKey)
      } catch (compensationError) {
        logger.error(
          { err: compensationError },
          'Unable to compensate failed material metadata creation'
        )
      }
      logger.error({ err: error }, 'Unable to create private material metadata')
      return response.internalServerError({ message: 'Unable to store material' })
    }

    return response.created(await serialize(MaterialTransformer.transform(material)))
  }

  async update({ params, request, serialize }: HttpContext) {
    const moduleId = parseRouteId(params.moduleId, 'moduleId')
    const materialId = parseRouteId(params.id, 'id')
    const material = await Material.query()
      .where('module_id', moduleId)
      .where('id', materialId)
      .firstOrFail()

    const payload = await request.validateUsing(updateMaterialValidator)

    material.merge(payload)
    await material.save()

    return serialize(MaterialTransformer.transform(material))
  }

  async destroy({ params, response, logger }: HttpContext) {
    const moduleId = parseRouteId(params.moduleId, 'moduleId')
    const materialId = parseRouteId(params.id, 'id')
    const candidate = await Material.query()
      .where('module_id', moduleId)
      .where('id', materialId)
      .first()
    if (!candidate) {
      return response.noContent()
    }

    try {
      const deletionOutcome = await db.transaction(async (trx) => {
        await lockModuleForUpdate(moduleId, trx)
        const lockedMaterial = await Material.query({ client: trx })
          .where('module_id', moduleId)
          .where('id', materialId)
          .forUpdate()
          .first()
        if (!lockedMaterial) {
          return 'not_found' as const
        }
        const accessLog = await AccessLog.query({ client: trx })
          .where('material_id', lockedMaterial.id)
          .select('id')
          .first()
        if (accessLog) {
          return 'has_access_logs' as const
        }
        const derivatives = await MaterialDerivative.query({ client: trx })
          .where('material_id', lockedMaterial.id)
          .orderBy('position', 'asc')
        const tileManifest = await ImageTileManifest.query({ client: trx })
          .where('material_id', lockedMaterial.id)
          .forUpdate()
          .first()
        const [countRow] = await Material.query({ client: trx })
          .where('module_id', moduleId)
          .count('* as total')
        const temporaryOffset = Number(countRow.$extras.total)

        for (const derivative of derivatives) {
          await deletePrivateObject(this.storage, derivative.storageKey)
        }
        if (tileManifest) {
          await deletePrivatePrefix(this.storage, tileManifest.storagePrefix)
        }
        await deletePrivateObject(this.storage, lockedMaterial.storageKey)
        await lockedMaterial.related('jobs').query().delete()
        await lockedMaterial.related('derivatives').query().delete()
        await lockedMaterial.related('imageTileManifest').query().delete()
        await lockedMaterial.useTransaction(trx).delete()
        if (temporaryOffset > 1) {
          await trx.rawQuery(
            'UPDATE materials SET position = position + ?, updated_at = CURRENT_TIMESTAMP WHERE module_id = ? AND position > ?',
            [temporaryOffset, moduleId, lockedMaterial.position]
          )
          await trx.rawQuery(
            'UPDATE materials SET position = position - ?, updated_at = CURRENT_TIMESTAMP WHERE module_id = ? AND position > ?',
            [temporaryOffset + 1, moduleId, lockedMaterial.position + temporaryOffset]
          )
        }
        return 'deleted' as const
      })

      if (deletionOutcome === 'has_access_logs') {
        return response.conflict({
          message: 'Material cannot be deleted because it has access history',
          code: 'MATERIAL_HAS_ACCESS_LOGS',
        })
      }
    } catch (error) {
      logger.error({ err: error }, 'Unable to delete private material')
      return response.internalServerError({ message: 'Unable to delete material' })
    }

    return response.noContent()
  }
}

async function configuredLimit(type: MaterialType) {
  const setting = await UploadSetting.findOrFail(type)
  return setting.maxSizeBytes
}

async function lockModuleForUpdate(moduleId: number, trx: TransactionClientContract) {
  return CourseModule.query({ client: trx }).where('id', moduleId).forUpdate().firstOrFail()
}

function parseRouteId(value: string, field: string) {
  const id = Number(value)
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(id) || id > 2_147_483_647) {
    throw new ValidationError([
      {
        message: `The ${field} field must be a valid numeric ID`,
        rule: 'number',
        field,
      },
    ])
  }

  return id
}

function isMissingObjectError(error: unknown) {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  const response = error as {
    name?: string
    code?: string
    $metadata?: { httpStatusCode?: number }
  }
  return (
    response.name === 'NotFound' ||
    response.name === 'NoSuchKey' ||
    response.code === 'NoSuchKey' ||
    response.$metadata?.httpStatusCode === 404
  )
}

async function deletePrivateObject(storage: MinioStorageProvider, key: string) {
  try {
    await storage.deleteObject(key)
  } catch (error) {
    if (!isMissingObjectError(error)) {
      throw error
    }
  }
}

async function deletePrivatePrefix(storage: MinioStorageProvider, prefix: string) {
  const keys = await storage.listKeys(prefix)
  for (const key of keys) {
    await deletePrivateObject(storage, key)
  }
  const remainingKeys = await storage.listKeys(prefix)
  if (remainingKeys.length > 0) {
    throw new Error('Private tile prefix cleanup left objects behind')
  }
}
