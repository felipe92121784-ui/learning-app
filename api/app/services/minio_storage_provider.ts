import env from '#start/env'
import { Upload } from '@aws-sdk/lib-storage'
import {
  CreateBucketCommand,
  DeleteBucketPolicyCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutBucketAclCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import type { StorageService, PutObjectInput } from '#services/storage_service'
import type { Readable } from 'node:stream'

type S3ClientLike = S3Client

interface MinioStorageProviderOptions {
  bucket?: string
  client?: S3ClientLike
}

export default class MinioStorageProvider implements StorageService {
  private bucket: string
  private client: S3ClientLike

  constructor(options: MinioStorageProviderOptions = {}) {
    this.bucket = options.bucket ?? env.get('S3_BUCKET')
    this.client =
      options.client ??
      new S3Client({
        endpoint: env.get('S3_ENDPOINT'),
        region: env.get('S3_REGION'),
        credentials: {
          accessKeyId: env.get('S3_ACCESS_KEY'),
          secretAccessKey: env.get('S3_SECRET_KEY'),
        },
        forcePathStyle: true,
        requestChecksumCalculation: 'WHEN_REQUIRED',
      })
  }

  async ensurePrivateBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }))
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error
      }
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }))
      } catch (createError) {
        if (!isConcurrentBucketCreationError(createError)) {
          throw createError
        }
      }
    }

    await this.removeBucketPolicy()
    await this.client.send(new PutBucketAclCommand({ Bucket: this.bucket, ACL: 'private' }))
  }

  async putObject(input: PutObjectInput): Promise<void> {
    await new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
      },
    }).done()
  }

  async getObject(key: string): Promise<Readable> {
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
    if (!response.Body) {
      throw new Error('Private object has no readable body')
    }

    return response.Body as Readable
  }

  async listKeys(prefix: string): Promise<string[]> {
    const keys: string[] = []
    let continuationToken: string | undefined

    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
        })
      )
      keys.push(...(response.Contents ?? []).flatMap((object) => (object.Key ? [object.Key] : [])))
      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
    } while (continuationToken)

    return keys
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))
      return true
    } catch (error) {
      if (isNotFoundError(error)) {
        return false
      }
      throw error
    }
  }

  private async removeBucketPolicy(): Promise<void> {
    try {
      await this.client.send(new DeleteBucketPolicyCommand({ Bucket: this.bucket }))
    } catch (error) {
      if (!isMissingBucketPolicyError(error)) {
        throw error
      }
    }
  }
}

function isNotFoundError(error: unknown) {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  const response = error as { name?: string; $metadata?: { httpStatusCode?: number } }
  return (
    response.name === 'NotFound' ||
    response.name === 'NoSuchKey' ||
    response.$metadata?.httpStatusCode === 404
  )
}

function isMissingBucketPolicyError(error: unknown) {
  return getS3ErrorName(error) === 'NoSuchBucketPolicy' || getS3ErrorStatus(error) === 404
}

function isConcurrentBucketCreationError(error: unknown) {
  const name = getS3ErrorName(error)
  return name === 'BucketAlreadyOwnedByYou' || name === 'BucketAlreadyExists'
}

function getS3ErrorName(error: unknown) {
  if (typeof error !== 'object' || error === null) {
    return undefined
  }

  return (error as { name?: string }).name
}

function getS3ErrorStatus(error: unknown) {
  if (typeof error !== 'object' || error === null) {
    return undefined
  }

  return (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
}
