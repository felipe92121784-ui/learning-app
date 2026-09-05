import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { uploadSettingsQueryKeys } from '@/features/settings/upload-settings-queries'
import { createAppRouter } from '@/router'

const admin = {
  id: 1,
  fullName: 'Ada Admin',
  email: 'ada.admin@example.test',
  role: 'ADMIN' as const,
  status: 'ACTIVE' as const,
}

const student = { ...admin, role: 'STUDENT' as const }
const settings = [
  { type: 'PDF' as const, maxSizeBytes: 100 * 1024 * 1024 },
  { type: 'IMAGE' as const, maxSizeBytes: 100 * 1024 * 1024 },
  { type: 'ZIP' as const, maxSizeBytes: 100 * 1024 * 1024 },
]

describe('administrative upload settings route', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('preloads upload settings for an administrator', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    vi.stubGlobal('fetch', vi.fn().mockImplementation((input: string | URL) => {
      const url = String(input)
      if (url.endsWith('/account/profile')) return Promise.resolve(Response.json({ data: { user: admin } }))
      if (url.endsWith('/upload-settings')) return Promise.resolve(Response.json({ data: settings }))
      throw new Error(`Unexpected request: ${url}`)
    }))
    const queryClient = new QueryClient()
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ['/admin/settings'] }),
      isServer: false,
      origin: 'http://localhost',
      queryClient,
    })

    await router.load()

    expect(router.state.location.pathname).toBe('/admin/settings')
    expect(queryClient.getQueryData(uploadSettingsQueryKeys.list())).toEqual(settings)
  })

  it('keeps settings inaccessible to students', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ data: { user: student } })))
    const router = createAppRouter({
      history: createMemoryHistory({ initialEntries: ['/admin/settings'] }),
      isServer: false,
      origin: 'http://localhost',
      queryClient: new QueryClient(),
    })

    await router.load()

    expect(router.state.location.pathname).toBe('/app')
  })
})
