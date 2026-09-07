import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from '@japa/runner'
import PdfRenderer, { ProcessingFailure } from '#services/pdf_renderer'
import sharp from 'sharp'

test('rejects a 301-page PDF before writing a derivative', async ({ assert }) => {
  const directory = await mkdtemp(join(tmpdir(), 'ideal-learning-pdf-test-'))
  const source = join(directory, 'source.pdf')
  await writeFile(source, 'not a real PDF', { mode: 0o600 })
  const renderer = new PdfRenderer({
    runCommand: async () => ({ stdout: 'Pages:          301\n', stderr: '' }),
  })

  try {
    const error = await rejected(() => renderer.render({ source, outputDirectory: directory }))
    assert.instanceOf(error, ProcessingFailure)
    assert.equal((error as ProcessingFailure).code, 'PDF_PAGE_LIMIT_EXCEEDED')
    assert.deepEqual(await readdir(directory), ['source.pdf'])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('renders PDF pages in ascending order as WebP without retaining PNGs', async ({ assert }) => {
  const directory = await mkdtemp(join(tmpdir(), 'ideal-learning-pdf-test-'))
  const source = join(directory, 'source.pdf')
  await writeFile(source, 'not a real PDF', { mode: 0o600 })
  const renderer = new PdfRenderer({
    runCommand: async (command, args) => {
      if (command === 'pdfinfo') {
        return { stdout: 'Pages: 3\n', stderr: '' }
      }

      const prefix = args.at(-1)!
      await sharp({ create: { width: 1, height: 1, channels: 3, background: '#ffffff' } })
        .png()
        .toFile(`${prefix}.png`)
      return { stdout: '', stderr: '' }
    },
  })

  try {
    const output = await renderer.render({ source, outputDirectory: directory })

    assert.deepEqual(
      output.pages.map((page) => page.pageNumber),
      [1, 2, 3]
    )
    assert.isTrue(output.pages.every((page) => page.mimeType === 'image/webp'))
    const files = await readdir(directory)
    assert.deepEqual(
      files.filter((file) => file.endsWith('.png')),
      []
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

async function rejected(action: () => Promise<unknown>) {
  try {
    await action()
  } catch (error) {
    return error
  }
  throw new Error('Expected action to reject')
}
