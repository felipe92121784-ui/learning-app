import type { MaterialType } from '#models/material'
import type { MultipartFile } from '@adonisjs/core/bodyparser'
import { ValidationError } from '@vinejs/vine'
import vine from '@vinejs/vine'
import { open } from 'node:fs/promises'
import { basename, extname } from 'node:path'

const title = () => vine.string().trim().minLength(2).maxLength(160)
const description = () => vine.string().trim().maxLength(2000).nullable().optional()

export const createMaterialValidator = vine.create({
  title: title(),
  description: description(),
})

export const updateMaterialValidator = vine.create({
  title: title().optional(),
  description: description(),
})

interface ValidatedMaterialFile {
  type: MaterialType
  mimeType: string
  originalFilename: string
  size: number
  tmpPath: string
}

interface SupportedFileType {
  type: MaterialType
  mimeType: string
  extensions: readonly string[]
  declaredMimeTypes: readonly string[]
}

export async function validateMaterialFile(
  file: MultipartFile | null,
  maxSizeForType: (type: MaterialType) => Promise<number>
): Promise<ValidatedMaterialFile> {
  if (!file?.tmpPath) {
    throw fileValidationError('A file is required')
  }

  const signature = await readSignature(file.tmpPath)
  const supportedType = detectSupportedType(signature)
  const clientExtension = extname(file.clientName).slice(1).toLowerCase()
  const declaredMimeType = String(file.headers['content-type'] ?? '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase()

  if (
    !supportedType ||
    !supportedType.extensions.includes(clientExtension) ||
    !supportedType.declaredMimeTypes.includes(declaredMimeType)
  ) {
    throw fileValidationError('The file type, extension, and contents must match')
  }

  const maxSizeBytes = await maxSizeForType(supportedType.type)
  if (file.size > maxSizeBytes) {
    throw fileValidationError('The file exceeds the configured size limit')
  }

  return {
    type: supportedType.type,
    mimeType: supportedType.mimeType,
    originalFilename: basename(file.clientName),
    size: file.size,
    tmpPath: file.tmpPath,
  }
}

async function readSignature(tmpPath: string) {
  const handle = await open(tmpPath, 'r')
  const signature = Buffer.alloc(16)

  try {
    const { bytesRead } = await handle.read(signature, 0, signature.length, 0)
    return signature.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

function detectSupportedType(signature: Buffer): SupportedFileType | null {
  if (signature.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    return {
      type: 'PDF',
      mimeType: 'application/pdf',
      extensions: ['pdf'],
      declaredMimeTypes: ['application/pdf'],
    }
  }

  if (
    signature.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return imageType('image/png', ['png'])
  }

  if (signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff) {
    return imageType('image/jpeg', ['jpg', 'jpeg'])
  }

  const gifHeader = signature.subarray(0, 6).toString('ascii')
  if (gifHeader === 'GIF87a' || gifHeader === 'GIF89a') {
    return imageType('image/gif', ['gif'])
  }

  if (
    signature.subarray(0, 4).toString('ascii') === 'RIFF' &&
    signature.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return imageType('image/webp', ['webp'])
  }

  const zipHeader = signature.subarray(0, 4)
  if (
    zipHeader.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) ||
    zipHeader.equals(Buffer.from([0x50, 0x4b, 0x05, 0x06])) ||
    zipHeader.equals(Buffer.from([0x50, 0x4b, 0x07, 0x08]))
  ) {
    return {
      type: 'ZIP',
      mimeType: 'application/zip',
      extensions: ['zip'],
      declaredMimeTypes: ['application/zip', 'application/x-zip-compressed'],
    }
  }

  return null
}

function imageType(mimeType: string, extensions: readonly string[]): SupportedFileType {
  return {
    type: 'IMAGE',
    mimeType,
    extensions,
    declaredMimeTypes: [mimeType],
  }
}

function fileValidationError(message: string) {
  return new ValidationError([
    {
      message,
      rule: 'file',
      field: 'file',
    },
  ])
}
