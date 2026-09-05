// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { deleteMaterial, listMaterials, updateMaterial, uploadMaterial } from './materials-api'

const material = { id: 2, moduleId: 9, title: 'Manual', description: null, type: 'PDF', originalFilename: 'manual.pdf', mimeType: 'application/pdf', size: 12, position: 0, processingStatus: 'PROCESSING', createdAt: '2026-09-05T00:00:00Z', updatedAt: null }

function mockApi(body: unknown, status = 200) {
  vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
  const response = status === 204 ? new Response(null, { status }) : Response.json(body, { status })
  const fetchMock = vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('materials API', () => {
  afterEach(() => { document.cookie = 'XSRF-TOKEN=; Max-Age=0'; vi.unstubAllEnvs(); vi.unstubAllGlobals() })
  it('unwraps materials and serializes metadata changes as JSON', async () => {
    const fetchMock = mockApi({ data: [material] })
    await expect(listMaterials(9)).resolves.toEqual([material])
    fetchMock.mockResolvedValueOnce(Response.json({ data: { ...material, title: 'Atualizado' } }))
    await updateMaterial(9, 2, { title: 'Atualizado', description: null })
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'PATCH', body: JSON.stringify({ title: 'Atualizado', description: null }) })
  })
  it('sends title, optional description, and file as multipart without a manual content type', async () => {
    const fetchMock = mockApi({ data: material })
    document.cookie = 'XSRF-TOKEN=csrf-token'
    const file = new File(['pdf'], 'manual.pdf', { type: 'application/pdf' })
    await uploadMaterial(9, { title: 'Manual', description: 'Leitura', file })
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.example.test/api/v1/modules/9/materials')
    expect(request.method).toBe('POST')
    expect(request.body).toBeInstanceOf(FormData)
    expect(new Headers(request.headers).get('Content-Type')).toBeNull()
    expect(new Headers(request.headers).get('x-xsrf-token')).toBe('csrf-token')
    expect((request.body as FormData).get('title')).toBe('Manual')
    expect((request.body as FormData).get('description')).toBe('Leitura')
    expect((request.body as FormData).get('file')).toBe(file)
  })
  it('deletes through the nested endpoint', async () => {
    const fetchMock = mockApi(undefined, 204)
    await expect(deleteMaterial(9, 2)).resolves.toBeUndefined()
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'DELETE' })
  })
})
