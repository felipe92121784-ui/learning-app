import { Readable } from 'node:stream'
import { test } from '@japa/runner'
import {
  CreateBucketCommand,
  DeleteBucketPolicyCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutBucketOwnershipControlsCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  PutPublicAccessBlockCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import type { PutBucketAclCommand } from '@aws-sdk/client-s3'
import MinioStorageProvider from '#services/minio_storage_provider'

class S3Error extends Error {
  declare name: string

  constructor(name: string) {
    super(name)
    this.name = name
  }
}

function testClient(send: (command: object) => Promise<unknown>) {
  return {
    send,
    config: {
      forcePathStyle: true,
      requestHandler: {},
      endpoint: async () => ({ hostname: 'storage.test', path: '/', protocol: 'http:' }),
    },
  } as unknown as S3Client
}

test('creates a bucket then removes its anonymous policy and applies the private ACL', async ({
  assert,
}) => {
  const commands: object[] = []
  const client = testClient(async (command) => {
    commands.push(command)
    if (command instanceof HeadBucketCommand) {
      throw new S3Error('NotFound')
    }
    if (command instanceof DeleteBucketPolicyCommand) {
      throw new S3Error('NoSuchBucketPolicy')
    }
    return {}
  })
  const storage = new MinioStorageProvider({
    bucket: 'materials',
    client,
  })

  await storage.ensurePrivateBucket()

  assert.deepEqual(
    commands.map((command) => command.constructor.name),
    ['HeadBucketCommand', 'CreateBucketCommand', 'DeleteBucketPolicyCommand', 'PutBucketAclCommand']
  )
  assert.deepEqual((commands[1] as CreateBucketCommand).input, { Bucket: 'materials' })
  assert.deepEqual((commands[2] as DeleteBucketPolicyCommand).input, { Bucket: 'materials' })
  assert.deepEqual((commands[3] as PutBucketAclCommand).input, {
    Bucket: 'materials',
    ACL: 'private',
  })
  assert.notInclude(commands, PutBucketPolicyCommand)
  assert.notInclude(commands, PutPublicAccessBlockCommand)
  assert.notInclude(commands, PutBucketOwnershipControlsCommand)
  assert.notProperty(storage, 'publicUrl')
})

test('tolerates a bucket created concurrently before applying private defaults', async ({
  assert,
}) => {
  for (const concurrentCreateError of ['BucketAlreadyOwnedByYou', 'BucketAlreadyExists']) {
    const commands: object[] = []
    const client = testClient(async (command) => {
      commands.push(command)
      if (command instanceof HeadBucketCommand) {
        throw new S3Error('NotFound')
      }
      if (command instanceof CreateBucketCommand) {
        throw new S3Error(concurrentCreateError)
      }
      if (command instanceof DeleteBucketPolicyCommand) {
        throw new S3Error('NoSuchBucketPolicy')
      }
      return {}
    })
    const storage = new MinioStorageProvider({ bucket: 'materials', client })

    await storage.ensurePrivateBucket()

    assert.deepEqual(
      commands.map((command) => command.constructor.name),
      [
        'HeadBucketCommand',
        'CreateBucketCommand',
        'DeleteBucketPolicyCommand',
        'PutBucketAclCommand',
      ]
    )
  }
})

test('removes an existing bucket policy before applying the private ACL', async ({ assert }) => {
  const commands: object[] = []
  const client = testClient(async (command) => {
    commands.push(command)
    return {}
  })
  const storage = new MinioStorageProvider({ bucket: 'materials', client })

  await storage.ensurePrivateBucket()

  assert.deepEqual(
    commands.map((command) => command.constructor.name),
    ['HeadBucketCommand', 'DeleteBucketPolicyCommand', 'PutBucketAclCommand']
  )
  assert.deepEqual((commands[1] as DeleteBucketPolicyCommand).input, { Bucket: 'materials' })
  assert.deepEqual((commands[2] as PutBucketAclCommand).input, {
    Bucket: 'materials',
    ACL: 'private',
  })
})

test('stores, detects, and deletes a caller-supplied private object key', async ({ assert }) => {
  const commands: object[] = []
  const client = testClient(async (command) => {
    commands.push(command)
    return {}
  })
  const storage = new MinioStorageProvider({
    bucket: 'materials',
    client,
  })

  await storage.putObject({
    key: 'originals/handbook.pdf',
    body: Readable.from('pdf'),
    contentType: 'application/pdf',
  })
  assert.isTrue(await storage.exists('originals/handbook.pdf'))
  await storage.deleteObject('originals/handbook.pdf')

  assert.instanceOf(commands[0], PutObjectCommand)
  assert.instanceOf(commands[1], HeadObjectCommand)
  assert.instanceOf(commands[2], DeleteObjectCommand)
})

test('reports false when a private object does not exist', async ({ assert }) => {
  const client = testClient(async (command) => {
    if (command instanceof HeadObjectCommand) {
      throw new S3Error('NotFound')
    }
    return {}
  })
  const storage = new MinioStorageProvider({
    bucket: 'materials',
    client,
  })

  assert.isFalse(await storage.exists('originals/missing.pdf'))
})

test('reads a private object body without creating a URL', async ({ assert }) => {
  const client = testClient(async (command) => {
    if (command instanceof GetObjectCommand) {
      return { Body: Readable.from('private bytes') }
    }
    return {}
  })
  const storage = new MinioStorageProvider({ bucket: 'materials', client })

  const body = await storage.getObject('originals/private.pdf')

  assert.equal(await readBody(body), 'private bytes')
  assert.notProperty(storage, 'publicUrl')
})

test('creates a five-minute attachment URL without exposing it in logs', async ({ assert }) => {
  let capturedCommand: GetObjectCommand | undefined
  let capturedExpiresIn: number | undefined
  let capturedSigningDate: Date | undefined
  const signingDate = new Date('2026-09-06T12:00:00.789Z')
  const client = testClient(async () => ({}))
  const storage = new MinioStorageProvider({
    bucket: 'materials',
    client,
    now: () => signingDate,
    createSignedUrl: async (command, expiresIn, signedAt) => {
      capturedCommand = command
      capturedExpiresIn = expiresIn
      capturedSigningDate = signedAt
      return 'https://storage.test/materials/originals/private-id?signature=private'
    },
  })

  const result = await storage.createTemporaryDownloadUrl({
    key: 'originals/private-id',
    filename: 'manual técnico.pdf',
    expiresInSeconds: 300,
  })

  assert.match(result.url, /^https?:\/\//)
  assert.equal(result.expiresAt, '2026-09-06T12:05:00.000Z')
  assert.deepInclude(capturedCommand?.input, {
    Bucket: 'materials',
    Key: 'originals/private-id',
    ResponseContentDisposition: 'attachment; filename="manual-tecnico.pdf"',
  })
  assert.equal(capturedExpiresIn, 300)
  assert.equal(capturedSigningDate?.toISOString(), '2026-09-06T12:00:00.000Z')
})

test('returns the exact expiry encoded into the SigV4 URL', async ({ assert }) => {
  const storage = new MinioStorageProvider({
    bucket: 'materials',
    now: () => new Date('2026-09-06T12:00:00.789Z'),
    client: new S3Client({
      endpoint: 'http://storage.test',
      region: 'us-east-1',
      credentials: { accessKeyId: 'test-access', secretAccessKey: 'test-secret' },
      forcePathStyle: true,
    }),
  })

  const result = await storage.createTemporaryDownloadUrl({
    key: 'originals/private-id',
    filename: 'manual.pdf',
    expiresInSeconds: 300,
  })
  const signedUrl = new URL(result.url)

  assert.equal(signedUrl.searchParams.get('X-Amz-Date'), '20260906T120000Z')
  assert.equal(signedUrl.searchParams.get('X-Amz-Expires'), '300')
  assert.equal(result.expiresAt, '2026-09-06T12:05:00.000Z')
})

test('bounds attachment filenames while preserving a safe extension and removing header controls', async ({
  assert,
}) => {
  let capturedCommand: GetObjectCommand | undefined
  const storage = new MinioStorageProvider({
    bucket: 'materials',
    client: testClient(async () => ({})),
    createSignedUrl: async (command) => {
      capturedCommand = command
      return 'https://storage.test/materials/originals/private-id?signature=private'
    },
  })

  await storage.createTemporaryDownloadUrl({
    key: 'originals/private-id',
    filename: `${'a'.repeat(4096)}.pdf`,
    expiresInSeconds: 300,
  })

  const longDisposition = capturedCommand!.input.ResponseContentDisposition!
  const longFilename = longDisposition.slice('attachment; filename="'.length, -1)
  assert.lengthOf(longFilename, 180)
  assert.match(longFilename, /\.pdf$/)

  await storage.createTemporaryDownloadUrl({
    key: 'originals/private-id',
    filename: 'report"\r\nX-Injected: yes.pdf',
    expiresInSeconds: 300,
  })

  const unsafeDisposition = capturedCommand!.input.ResponseContentDisposition!
  assert.notInclude(unsafeDisposition, '\r')
  assert.notInclude(unsafeDisposition, '\n')
  assert.notInclude(unsafeDisposition, '"\r')
  assert.match(unsafeDisposition, /^attachment; filename="[A-Za-z0-9._ -]+"$/)
})

test('lists every private object key across paginated results', async ({ assert }) => {
  const inputs: unknown[] = []
  const client = testClient(async (command) => {
    if (command instanceof ListObjectsV2Command) {
      inputs.push(command.input)
      if (command.input.ContinuationToken === undefined) {
        return {
          Contents: [{ Key: 'derivatives/7/run-a/page-1.webp' }],
          IsTruncated: true,
          NextContinuationToken: 'next-page',
        }
      }
      return { Contents: [{ Key: 'derivatives/7/run-a/page-2.webp' }], IsTruncated: false }
    }
    return {}
  })
  const storage = new MinioStorageProvider({ bucket: 'materials', client })

  const keys = await storage.listKeys('derivatives/7/')

  assert.deepEqual(keys, ['derivatives/7/run-a/page-1.webp', 'derivatives/7/run-a/page-2.webp'])
  assert.deepEqual(inputs, [
    { Bucket: 'materials', Prefix: 'derivatives/7/' },
    { Bucket: 'materials', Prefix: 'derivatives/7/', ContinuationToken: 'next-page' },
  ])
})

async function readBody(body: Readable) {
  let value = ''
  for await (const chunk of body) {
    value += chunk.toString()
  }
  return value
}
