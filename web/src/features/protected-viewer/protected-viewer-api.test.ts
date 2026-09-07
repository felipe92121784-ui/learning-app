// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getProtectedMaterialView,
  requestOriginalDownload,
} from './protected-viewer-api'
import type { ProtectedMaterialView } from './protected-viewer-types'

const manifest = {
  id: 14,
  title: 'Guia protegido',
  type: 'PDF',
  viewer: {
    kind: 'PDF_PAGES',
    derivatives: [
      {
        id: 41,
        pageNumber: 1,
        width: 1200,
        height: 1600,
        position: 0,
        contentUrl: 'https://api.example.test/api/v1/materials/14/derivatives/41',
      },
    ],
  },
  download: { allowed: true },
} satisfies ProtectedMaterialView

function mockApi(body: unknown) {
  vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
  const fetchMock = vi.fn().mockResolvedValue(Response.json(body))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('protected viewer API', () => {
  afterEach(() => {
    document.cookie = 'XSRF-TOKEN=; Max-Age=0'
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('gets the safe manifest and posts with CSRF to request an authorized download', async () => {
    const fetchMock = mockApi({ data: manifest })

    await expect(getProtectedMaterialView(14)).resolves.toEqual(manifest)

    document.cookie = 'XSRF-TOKEN=csrf-token'
    fetchMock.mockResolvedValueOnce(
      Response.json({
        data: {
          url: 'https://minio.test/signed',
          expiresAt: '2026-09-06T12:05:00.000Z',
        },
      }),
    )
    await expect(requestOriginalDownload(14)).resolves.toEqual({
      url: 'https://minio.test/signed',
      expiresAt: '2026-09-06T12:05:00.000Z',
    })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.example.test/api/v1/materials/14/view',
    )
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://api.example.test/api/v1/materials/14/download-url',
    )
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      credentials: 'include',
    })
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('x-xsrf-token')).toBe(
      'csrf-token',
    )
  })
})
