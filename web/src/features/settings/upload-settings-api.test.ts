import { afterEach, describe, expect, it, vi } from 'vitest'
import { listUploadSettings, updateUploadSetting } from './upload-settings-api'

describe('upload settings API', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
  it('reads settings and sends a JSON MB limit update', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ data: [{ type: 'PDF', maxSizeBytes: 104857600 }] }))
      .mockResolvedValueOnce(Response.json({ data: { type: 'PDF', maxSizeBytes: 209715200 } }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(listUploadSettings()).resolves.toEqual([{ type: 'PDF', maxSizeBytes: 104857600 }])
    await updateUploadSetting('PDF', 200)
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://api.example.test/api/v1/upload-settings/PDF')
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'PATCH', body: JSON.stringify({ maxSizeMb: 200 }) })
  })
})
