// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { materialsQueryKeys, useDeleteMaterialMutation, useUpdateMaterialMutation, useUploadMaterialMutation } from './materials-queries'

function harness() { const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); function Wrapper({ children }: PropsWithChildren) { return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider> }; return { queryClient, Wrapper } }
describe('materials queries', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
  it('invalidates the affected module after upload and delete', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ data: { id: 2 } })))
    const up = harness(); up.queryClient.setQueryData(materialsQueryKeys.list(9), []); const upload = renderHook(() => useUploadMaterialMutation(), { wrapper: up.Wrapper })
    await act(async () => { await upload.result.current.mutateAsync({ moduleId: 9, title: 'Manual', file: new File(['pdf'], 'manual.pdf', { type: 'application/pdf' }) }) })
    expect(up.queryClient.getQueryState(materialsQueryKeys.list(9))?.isInvalidated).toBe(true)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    const deleted = harness(); deleted.queryClient.setQueryData(materialsQueryKeys.list(9), []); const remove = renderHook(() => useDeleteMaterialMutation(), { wrapper: deleted.Wrapper })
    await act(async () => { await remove.result.current.mutateAsync({ moduleId: 9, materialId: 2 }) })
    expect(deleted.queryClient.getQueryState(materialsQueryKeys.list(9))?.isInvalidated).toBe(true)
  })
  it('invalidates the affected module after editing material metadata', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ data: { id: 2, title: 'Atualizado' } })))
    const edited = harness(); edited.queryClient.setQueryData(materialsQueryKeys.list(9), [])
    const update = renderHook(() => useUpdateMaterialMutation(), { wrapper: edited.Wrapper })
    await act(async () => { await update.result.current.mutateAsync({ moduleId: 9, materialId: 2, input: { title: 'Atualizado', description: null } }) })
    expect(edited.queryClient.getQueryState(materialsQueryKeys.list(9))?.isInvalidated).toBe(true)
  })
})
