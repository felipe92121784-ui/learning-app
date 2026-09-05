import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from '@japa/runner'
import PdfRenderer, { ProcessingFailure } from '#services/pdf_renderer'

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL8DwAAAABJRU5ErkJggg==',
  'base64'
)

test('rejects a 301-page PDF before writing a derivative', async ({ assert }) => {
  const directory = await mkdtemp(join(tmpdir(), 'ideal-learning-pdf-test-'))
  const source = join(directory, 'source.pdf')
  await writeFile(source, 'not a real PDF', { mode: 0o600 })
  const renderer = new PdfRenderer({
    runCommand: async () => ({ stdout: 'Pages:          301\n', stderr: '' }),
  })

  try {
    const error = await assert.rejects(() => renderer.render({ source, outputDirectory: directory }))
    assert.instanceOf(error, ProcessingFailure)
    assert.equal(error.code, 'PDF_PAGE_LIMIT_EXCEEDED')
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
      await writeFile(`${prefix}.png`, png, { mode: 0o600 })
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
    assert.deepEqual((await readdir(directory)).filter((file) => file.endsWith('.png')), [])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
