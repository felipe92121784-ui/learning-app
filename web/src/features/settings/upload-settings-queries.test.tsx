// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { uploadSettingsQueryKeys, useUpdateUploadSettingMutation } from './upload-settings-queries'

describe('upload setting queries', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
  it('invalidates the settings list after a successful update', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ data: { type: 'PDF', maxSizeBytes: 209715200 } })))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    function Wrapper({ children }: PropsWithChildren) { return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider> }
    queryClient.setQueryData(uploadSettingsQueryKeys.list(), [])
    const { result } = renderHook(() => useUpdateUploadSettingMutation(), { wrapper: Wrapper })
    await act(async () => { await result.current.mutateAsync({ type: 'PDF', maxSizeMb: 200 }) })
    expect(queryClient.getQueryState(uploadSettingsQueryKeys.list())?.isInvalidated).toBe(true)
  })
})
