import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import env from '#start/env'
import MinioStorageProvider from '#services/minio_storage_provider'
import { DeleteBucketCommand, GetBucketPolicyCommand, S3Client } from '@aws-sdk/client-s3'
import { test } from '@japa/runner'

const bucket = `storage-test-${randomUUID()}`
const client = new S3Client({
  endpoint: env.get('S3_ENDPOINT'),
  region: env.get('S3_REGION'),
  credentials: {
    accessKeyId: env.get('S3_ACCESS_KEY'),
    secretAccessKey: env.get('S3_SECRET_KEY'),
  },
  forcePathStyle: true,
})

test.group('MinIO storage provider integration', (group) => {
  group.teardown(async () => {
    try {
      await client.send(new DeleteBucketCommand({ Bucket: bucket }))
    } catch (error) {
      if ((error as { name?: string }).name !== 'NoSuchBucket') {
        throw error
      }
    }
  })

  test('creates a private bucket with no anonymous bucket policy', async ({ assert }) => {
    const storage = new MinioStorageProvider({ bucket })

    await storage.ensurePrivateBucket()
    await storage.putObject({
      key: 'originals/integration.pdf',
      body: Readable.from('private PDF'),
      contentType: 'application/pdf',
    })

    assert.isTrue(await storage.exists('originals/integration.pdf'))
    await assert.rejects(() => client.send(new GetBucketPolicyCommand({ Bucket: bucket })))

    await storage.deleteObject('originals/integration.pdf')
    assert.isFalse(await storage.exists('originals/integration.pdf'))
  })
})
