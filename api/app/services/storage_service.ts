import type { Readable } from 'node:stream'

export interface PutObjectInput {
  key: string
  body: Readable
  contentType: string
}

export interface CreateTemporaryDownloadUrlInput {
  key: string
  filename: string
  expiresInSeconds: 300
}

export interface TemporaryDownloadUrl {
  url: string
  expiresAt: string
}

export interface StorageService {
  ensurePrivateBucket(): Promise<void>
  putObject(input: PutObjectInput): Promise<void>
  getObject(key: string): Promise<Readable>
  createTemporaryDownloadUrl(input: CreateTemporaryDownloadUrlInput): Promise<TemporaryDownloadUrl>
  listKeys(prefix: string): Promise<string[]>
  deleteObject(key: string): Promise<void>
  exists(key: string): Promise<boolean>
}
