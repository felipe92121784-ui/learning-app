export const MATERIAL_TYPES = ['PDF', 'IMAGE', 'ZIP'] as const

export type MaterialType = (typeof MATERIAL_TYPES)[number]

export type MaterialProcessingStatus = 'UPLOADING' | 'PROCESSING' | 'READY' | 'FAILED'

export interface Material {
  id: number
  moduleId: number
  title: string
  description: string | null
  type: MaterialType
  originalFilename: string
  mimeType: string
  size: number
  position: number
  processingStatus: MaterialProcessingStatus
  createdAt: string
  updatedAt: string | null
}

export interface UploadSetting {
  type: MaterialType
  maxSizeBytes: number
}

export interface UpdateMaterialInput {
  title?: string
  description?: string | null
}

export function materialTypeLabel(type: MaterialType): string {
  return { PDF: 'PDF', IMAGE: 'Imagem', ZIP: 'ZIP' }[type]
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.ceil(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', {
    maximumFractionDigits: 1,
  })} MB`
}
