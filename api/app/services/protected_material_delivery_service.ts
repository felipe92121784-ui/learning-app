import { appUrl } from '#config/app'
import Material, { type MaterialType } from '#models/material'
import MaterialDerivative from '#models/material_derivative'
import ImageTileManifest from '#models/image_tile_manifest'
import User from '#models/user'
import AccessControlService, {
  type AccessDecision,
  type ResolveAccessInput,
} from '#services/access_control_service'
import AccessLogService, { type CreateAccessLogInput } from '#services/access_log_service'
import MinioStorageProvider from '#services/minio_storage_provider'
import ProtectedWatermarkService, {
  type ProtectedWatermarkInput,
} from '#services/protected_watermark_service'
import type { StorageService } from '#services/storage_service'
import { DateTime } from 'luxon'
import type { Readable } from 'node:stream'

export interface SafeDerivative {
  id: number
  pageNumber: number | null
  width: number
  height: number
  position: number
  contentUrl: string
}

export interface SafeTileManifest {
  width: number
  height: number
  tileSize: number
  minLevel: number
  maxLevel: number
  tileUrlTemplate: string
}

type ProtectedViewer =
  | { kind: 'PDF_PAGES' | 'IMAGE_PREVIEW'; derivatives: SafeDerivative[] }
  | { kind: 'IMAGE_TILES'; manifestUrl: string }

export interface ProtectedMaterialView {
  id: number
  title: string
  type: MaterialType
  viewer: ProtectedViewer | null
  download: { allowed: boolean }
}

export interface ProtectedDerivative {
  body: Buffer
  mimeType: string
}

export interface TemporaryMaterialDownload {
  url: string
  expiresAt: string
}

interface AuditContext {
  ipAddress?: string | null
  userAgent?: string | null
}

interface MaterialRequest extends AuditContext {
  userId: number
  materialId: number
}

interface DerivativeRequest extends MaterialRequest {
  derivativeId: number
}

interface TileRequest extends MaterialRequest {
  level: number
  column: number
  row: number
}

interface AccessControlResolver {
  resolve(input: ResolveAccessInput): Promise<AccessDecision>
}

interface AccessLogRecorder {
  record(input: CreateAccessLogInput): Promise<unknown>
}

interface WatermarkApplier {
  apply(input: ProtectedWatermarkInput): Promise<Buffer>
}

interface ProtectedMaterialDeliveryOptions {
  accessControl?: AccessControlResolver
  accessLog?: AccessLogRecorder
  storage?: StorageService
  watermark?: WatermarkApplier
  now?: () => DateTime
  apiBaseUrl?: string
}

export class ProtectedMaterialNotFoundError extends Error {
  constructor() {
    super('Protected material resource does not exist')
    this.name = 'ProtectedMaterialNotFoundError'
  }
}

export class ProtectedMaterialForbiddenError extends Error {
  constructor() {
    super('Protected material access denied')
    this.name = 'ProtectedMaterialForbiddenError'
  }
}

export type ProtectedMaterialUnavailableCode = 'MATERIAL_NOT_READY' | 'DERIVATIVES_NOT_READY'

export class ProtectedMaterialUnavailableError extends Error {
  constructor(public code: ProtectedMaterialUnavailableCode) {
    super('Protected material is not available')
    this.name = 'ProtectedMaterialUnavailableError'
  }
}

export default class ProtectedMaterialDeliveryService {
  private accessControl: AccessControlResolver
  private accessLog: AccessLogRecorder
  private storage: StorageService
  private watermark: WatermarkApplier
  private now: () => DateTime
  private apiBaseUrl: string

  constructor(options: ProtectedMaterialDeliveryOptions = {}) {
    this.accessControl = options.accessControl ?? new AccessControlService()
    this.accessLog = options.accessLog ?? new AccessLogService()
    this.storage = options.storage ?? new MinioStorageProvider()
    this.watermark = options.watermark ?? new ProtectedWatermarkService()
    this.now = options.now ?? (() => DateTime.utc())
    this.apiBaseUrl = (options.apiBaseUrl ?? appUrl).replace(/\/$/, '')
  }

  async getView(input: MaterialRequest): Promise<ProtectedMaterialView> {
    const material = await this.findMaterial(input.materialId)
    await this.requireCapability(material, input, 'VIEW')

    if (material.processingStatus !== 'READY') {
      throw new ProtectedMaterialUnavailableError('MATERIAL_NOT_READY')
    }

    const viewer = await this.buildViewer(material)
    const download = await this.resolve(material.id, input.userId, 'DOWNLOAD')

    await this.record(input, 'VIEW_MATERIAL')

    return {
      id: material.id,
      title: material.title,
      type: material.type,
      viewer,
      download: { allowed: download.allowed },
    }
  }

  async getDerivative(input: DerivativeRequest): Promise<ProtectedDerivative> {
    const material = await this.findMaterial(input.materialId)
    await this.requireCapability(material, input, 'VIEW')
    this.requireReady(material)
    const derivative = await MaterialDerivative.query()
      .where('id', input.derivativeId)
      .where('material_id', material.id)
      .first()

    if (!derivative) {
      throw new ProtectedMaterialNotFoundError()
    }

    const stream = await this.storage.getObject(derivative.storageKey)
    return this.watermarkVisual(input, stream, derivative.width, derivative.height)
  }

  async getTileManifest(input: MaterialRequest): Promise<SafeTileManifest> {
    const material = await this.findMaterial(input.materialId)
    await this.requireCapability(material, input, 'VIEW')
    this.requireReady(material)
    const manifest = await this.findTileManifest(material)

    return {
      width: manifest.width,
      height: manifest.height,
      tileSize: manifest.tileSize,
      minLevel: manifest.minLevel,
      maxLevel: manifest.maxLevel,
      tileUrlTemplate: `${this.apiBaseUrl}/api/v1/materials/${material.id}/tiles/{level}/{column}/{row}`,
    }
  }

  async getTile(input: TileRequest): Promise<ProtectedDerivative> {
    const material = await this.findMaterial(input.materialId)
    await this.requireCapability(material, input, 'VIEW')
    this.requireReady(material)
    const manifest = await this.findTileManifest(material)
    const tile = this.resolveTile(manifest, input)
    const stream = await this.storage.getObject(`${manifest.storagePrefix}${tile.relativeKey}`)

    return this.watermarkVisual(input, stream, tile.width, tile.height)
  }

  async createDownloadUrl(input: MaterialRequest): Promise<TemporaryMaterialDownload> {
    const material = await this.findMaterial(input.materialId)
    const decisionTime = this.now()
    const decision = await this.resolve(material.id, input.userId, 'DOWNLOAD', decisionTime)

    if (!decision.allowed) {
      await this.record(input, 'FAILED_ACCESS')
      throw new ProtectedMaterialForbiddenError()
    }

    const download = await this.storage.createTemporaryDownloadUrl({
      key: material.storageKey,
      filename: material.originalFilename,
      expiresInSeconds: 300,
    })
    await this.record(input, 'DOWNLOAD_MATERIAL')

    return download
  }

  private async findMaterial(materialId: number) {
    const material = await Material.find(materialId)
    if (!material) {
      throw new ProtectedMaterialNotFoundError()
    }
    return material
  }

  private requireReady(material: Material) {
    if (material.processingStatus !== 'READY') {
      throw new ProtectedMaterialUnavailableError('MATERIAL_NOT_READY')
    }
  }

  private async requireCapability(
    material: Material,
    input: MaterialRequest,
    capability: 'VIEW' | 'DOWNLOAD'
  ) {
    const decision = await this.resolve(material.id, input.userId, capability)
    if (!decision.allowed) {
      await this.record(input, 'FAILED_ACCESS')
      throw new ProtectedMaterialForbiddenError()
    }
  }

  private resolve(
    materialId: number,
    userId: number,
    capability: 'VIEW' | 'DOWNLOAD',
    now = this.now()
  ) {
    return this.accessControl.resolve({
      userId,
      resourceType: 'MATERIAL',
      resourceId: materialId,
      capability,
      now,
    })
  }

  private record(input: MaterialRequest, action: CreateAccessLogInput['action']) {
    return this.accessLog.record({
      userId: input.userId,
      materialId: input.materialId,
      action,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    })
  }

  private async watermarkVisual(
    input: MaterialRequest,
    stream: Readable,
    width: number,
    height: number
  ): Promise<ProtectedDerivative> {
    const user = await User.find(input.userId)
    if (!user) {
      throw new Error('Authenticated user is unavailable')
    }

    return {
      body: await this.watermark.apply({
        stream,
        width,
        height,
        fullName: user.fullName ?? 'Unknown user',
        email: user.email,
        occurredAt: this.now(),
      }),
      mimeType: 'image/webp',
    }
  }

  private async findTileManifest(material: Material): Promise<ImageTileManifest> {
    if (material.type !== 'IMAGE') {
      throw new ProtectedMaterialNotFoundError()
    }

    const manifest = await ImageTileManifest.query().where('material_id', material.id).first()
    if (!manifest) {
      throw new ProtectedMaterialUnavailableError('DERIVATIVES_NOT_READY')
    }
    return manifest
  }

  private resolveTile(manifest: ImageTileManifest, input: TileRequest) {
    if (
      !Number.isSafeInteger(input.level) ||
      !Number.isSafeInteger(input.column) ||
      !Number.isSafeInteger(input.row) ||
      input.level < manifest.minLevel ||
      input.level > manifest.maxLevel ||
      input.column < 0 ||
      input.row < 0
    ) {
      throw new ProtectedMaterialNotFoundError()
    }

    const scale = 2 ** (manifest.maxLevel - input.level)
    const levelWidth = Math.ceil(manifest.width / scale)
    const levelHeight = Math.ceil(manifest.height / scale)
    const columns = Math.ceil(levelWidth / manifest.tileSize)
    const rows = Math.ceil(levelHeight / manifest.tileSize)
    if (input.column >= columns || input.row >= rows) {
      throw new ProtectedMaterialNotFoundError()
    }

    return {
      relativeKey: `tiles/${input.level}/${input.column}/${input.row}.webp`,
      width: Math.min(manifest.tileSize, levelWidth - input.column * manifest.tileSize),
      height: Math.min(manifest.tileSize, levelHeight - input.row * manifest.tileSize),
    }
  }

  private async buildViewer(material: Material): Promise<ProtectedMaterialView['viewer']> {
    if (material.type === 'ZIP') {
      return null
    }

    if (material.type === 'IMAGE') {
      const tileManifest = await ImageTileManifest.query().where('material_id', material.id).first()
      if (tileManifest) {
        return {
          kind: 'IMAGE_TILES',
          manifestUrl: `${this.apiBaseUrl}/api/v1/materials/${material.id}/tiles/manifest`,
        }
      }
    }

    const kind = material.type === 'PDF' ? 'PDF_PAGE' : 'IMAGE_PREVIEW'
    const derivatives = await MaterialDerivative.query()
      .where('material_id', material.id)
      .where('kind', kind)
      .orderBy('position', 'asc')

    if (derivatives.length === 0) {
      throw new ProtectedMaterialUnavailableError('DERIVATIVES_NOT_READY')
    }

    if (material.type === 'IMAGE' && derivatives.length !== 1) {
      throw new ProtectedMaterialUnavailableError('DERIVATIVES_NOT_READY')
    }

    return {
      kind: material.type === 'PDF' ? 'PDF_PAGES' : 'IMAGE_PREVIEW',
      derivatives: derivatives.map((derivative) => ({
        id: derivative.id,
        pageNumber: derivative.pageNumber,
        width: derivative.width,
        height: derivative.height,
        position: derivative.position,
        contentUrl: `${this.apiBaseUrl}/api/v1/materials/${material.id}/derivatives/${derivative.id}`,
      })),
    }
  }
}
