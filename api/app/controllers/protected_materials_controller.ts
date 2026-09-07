import ProtectedMaterialDeliveryService, {
  ProtectedMaterialForbiddenError,
  ProtectedMaterialNotFoundError,
  ProtectedMaterialUnavailableError,
} from '#services/protected_material_delivery_service'
import type { HttpContext } from '@adonisjs/core/http'
import { ValidationError } from '@vinejs/vine'

export default class ProtectedMaterialsController {
  private delivery = new ProtectedMaterialDeliveryService()

  async view({ auth, params, request, response, serialize, logger }: HttpContext) {
    try {
      const manifest = await this.delivery.getView({
        userId: auth.use('web').getUserOrFail().id,
        materialId: parseRouteId(params.id, 'id'),
        ipAddress: request.ip(),
        userAgent: request.header('user-agent'),
      })
      return serialize(manifest)
    } catch (error) {
      return this.handleError(error, response, logger)
    }
  }

  async derivative({ auth, params, request, response, logger }: HttpContext) {
    try {
      const derivative = await this.delivery.getDerivative({
        userId: auth.use('web').getUserOrFail().id,
        materialId: parseRouteId(params.materialId, 'materialId'),
        derivativeId: parseRouteId(params.derivativeId, 'derivativeId'),
        ipAddress: request.ip(),
        userAgent: request.header('user-agent'),
      })

      response.header('Content-Type', derivative.mimeType)
      response.header('Content-Disposition', 'inline')
      response.header('Cache-Control', 'private, no-store')
      return response.send(derivative.body)
    } catch (error) {
      return this.handleError(error, response, logger)
    }
  }

  async tileManifest({ auth, params, request, response, serialize, logger }: HttpContext) {
    try {
      const manifest = await this.delivery.getTileManifest({
        userId: auth.use('web').getUserOrFail().id,
        materialId: parseRouteId(params.materialId, 'materialId'),
        ipAddress: request.ip(),
        userAgent: request.header('user-agent'),
      })
      return serialize(manifest)
    } catch (error) {
      return this.handleError(error, response, logger)
    }
  }

  async tile({ auth, params, request, response, logger }: HttpContext) {
    try {
      const tile = await this.delivery.getTile({
        userId: auth.use('web').getUserOrFail().id,
        materialId: parseRouteId(params.materialId, 'materialId'),
        level: parseRouteCoordinate(params.level, 'level'),
        column: parseRouteCoordinate(params.column, 'column'),
        row: parseRouteCoordinate(params.row, 'row'),
        ipAddress: request.ip(),
        userAgent: request.header('user-agent'),
      })

      response.header('Content-Type', tile.mimeType)
      response.header('Content-Disposition', 'inline')
      response.header('Cache-Control', 'private, no-store')
      return response.send(tile.body)
    } catch (error) {
      return this.handleError(error, response, logger)
    }
  }

  async downloadUrl({ auth, params, request, response, serialize, logger }: HttpContext) {
    try {
      const download = await this.delivery.createDownloadUrl({
        userId: auth.use('web').getUserOrFail().id,
        materialId: parseRouteId(params.id, 'id'),
        ipAddress: request.ip(),
        userAgent: request.header('user-agent'),
      })
      return serialize(download)
    } catch (error) {
      return this.handleError(error, response, logger)
    }
  }

  private handleError(
    error: unknown,
    response: HttpContext['response'],
    logger: HttpContext['logger']
  ) {
    if (error instanceof ValidationError) {
      throw error
    }
    if (error instanceof ProtectedMaterialNotFoundError) {
      return response.notFound({ message: 'Protected material not found' })
    }
    if (error instanceof ProtectedMaterialForbiddenError) {
      return response.forbidden({ message: 'Forbidden' })
    }
    if (error instanceof ProtectedMaterialUnavailableError) {
      return response.conflict({
        message: 'Protected material unavailable',
        code: error.code,
      })
    }

    logger.error('Protected material delivery failed')
    return response.internalServerError({ message: 'Unable to deliver protected material' })
  }
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

function parseRouteCoordinate(value: string, field: string) {
  const coordinate = Number(value)
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(coordinate) || coordinate > 2_147_483_647) {
    throw new ValidationError([
      {
        message: `The ${field} field must be a valid non-negative integer`,
        rule: 'number',
        field,
      },
    ])
  }
  return coordinate
}
