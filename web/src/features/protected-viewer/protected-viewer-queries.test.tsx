// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  protectedMaterialViewQueryOptions,
  useOriginalDownloadMutation,
} from './protected-viewer-queries'

function harness() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return { queryClient, Wrapper }
}

describe('protected viewer queries', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('uses a stable view query key per material', () => {
    expect(protectedMaterialViewQueryOptions(14).queryKey).toEqual([
      'protected-material-view',
      14,
    ])
  })

  it('returns a requested download only to its caller without writing React Query or browser storage', async () => {
    const signedUrl = 'https://minio.test/signed'
    const localStorageMock = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    }
    const sessionStorageMock = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    }
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    vi.stubGlobal('localStorage', localStorageMock)
    vi.stubGlobal('sessionStorage', sessionStorageMock)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          data: {
            url: signedUrl,
            expiresAt: '2026-09-06T12:05:00.000Z',
          },
        }),
      ),
    )
    const { queryClient, Wrapper } = harness()
    const mutation = renderHook(() => useOriginalDownloadMutation(), { wrapper: Wrapper })

    let download: { url: string; expiresAt: string } | undefined
    await act(async () => {
      download = await mutation.result.current.mutateAsync(14)
    })

    expect(download).toEqual({
      url: signedUrl,
      expiresAt: '2026-09-06T12:05:00.000Z',
    })

    expect(JSON.stringify(queryClient.getQueryCache().getAll())).not.toContain(signedUrl)
    expect(JSON.stringify(queryClient.getMutationCache().getAll())).not.toContain(signedUrl)
    expect(localStorageMock.setItem).not.toHaveBeenCalled()
    expect(sessionStorageMock.setItem).not.toHaveBeenCalled()
  })

  it('exposes loading and errors without persisting a download response', async () => {
    let rejectRequest: (reason: Error) => void = () => undefined
    const response = new Promise<Response>((_resolve, reject) => {
      rejectRequest = reject
    })
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(response))
    const { Wrapper } = harness()
    const download = renderHook(() => useOriginalDownloadMutation(), { wrapper: Wrapper })

    expect(download.result.current.isPending).toBe(false)
    let pendingRequest: Promise<unknown> | undefined
    act(() => {
      pendingRequest = download.result.current.mutateAsync(14)
    })

    expect(download.result.current.isPending).toBe(true)
    await act(async () => {
      rejectRequest(new Error('Network unavailable'))
      await expect(pendingRequest).rejects.toThrow('Network unavailable')
    })

    expect(download.result.current.isPending).toBe(false)
    expect(download.result.current.error).toMatchObject({ message: 'Network unavailable' })
  })

  it('keeps concurrent loading accurate and ignores an older failure after a newer request starts', async () => {
    let rejectFirst: (reason: Error) => void = () => undefined
    let resolveSecond: (response: Response) => void = () => undefined
    const firstResponse = new Promise<Response>((_resolve, reject) => {
      rejectFirst = reject
    })
    const secondResponse = new Promise<Response>((resolve) => {
      resolveSecond = resolve
    })
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValueOnce(firstResponse).mockReturnValueOnce(secondResponse),
    )
    const { queryClient, Wrapper } = harness()
    const download = renderHook(() => useOriginalDownloadMutation(), { wrapper: Wrapper })

    let firstRequest: Promise<unknown> | undefined
    let secondRequest: Promise<unknown> | undefined
    act(() => {
      firstRequest = download.result.current.mutateAsync(14)
      secondRequest = download.result.current.mutateAsync(14)
    })

    expect(download.result.current.isPending).toBe(true)
    await act(async () => {
      rejectFirst(new Error('Older request failed'))
      await expect(firstRequest).rejects.toThrow('Older request failed')
    })

    expect(download.result.current.isPending).toBe(true)
    expect(download.result.current.error).toBeNull()

    await act(async () => {
      resolveSecond(
        Response.json({
          data: {
            url: 'https://minio.test/newer-signed-url',
            expiresAt: '2026-09-06T12:05:00.000Z',
          },
        }),
      )
      await expect(secondRequest).resolves.toMatchObject({
        url: 'https://minio.test/newer-signed-url',
      })
    })

    expect(download.result.current.isPending).toBe(false)
    expect(download.result.current.error).toBeNull()
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0)
    expect(JSON.stringify(queryClient.getQueryCache().getAll())).not.toContain(
      'https://minio.test/newer-signed-url',
    )
  })

  it('stays pending when an older request succeeds before a newer request finishes', async () => {
    const signedUrl = 'https://minio.test/older-signed-url'
    const localStorageMock = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    }
    const sessionStorageMock = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    }
    let resolveFirst: (response: Response) => void = () => undefined
    let rejectSecond: (reason: Error) => void = () => undefined
    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirst = resolve
    })
    const secondResponse = new Promise<Response>((_resolve, reject) => {
      rejectSecond = reject
    })
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    vi.stubGlobal('localStorage', localStorageMock)
    vi.stubGlobal('sessionStorage', sessionStorageMock)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValueOnce(firstResponse).mockReturnValueOnce(secondResponse),
    )
    const { queryClient, Wrapper } = harness()
    const download = renderHook(() => useOriginalDownloadMutation(), { wrapper: Wrapper })

    let firstRequest: Promise<unknown> | undefined
    let secondRequest: Promise<unknown> | undefined
    act(() => {
      firstRequest = download.result.current.mutateAsync(14)
      secondRequest = download.result.current.mutateAsync(14)
    })

    await act(async () => {
      resolveFirst(
        Response.json({
          data: {
            url: signedUrl,
            expiresAt: '2026-09-06T12:05:00.000Z',
          },
        }),
      )
      await expect(firstRequest).resolves.toMatchObject({ url: signedUrl })
    })

    expect(download.result.current.isPending).toBe(true)
    expect(download.result.current.error).toBeNull()

    await act(async () => {
      rejectSecond(new Error('Newer request failed'))
      await expect(secondRequest).rejects.toThrow('Newer request failed')
    })

    expect(download.result.current.isPending).toBe(false)
    expect(download.result.current.error).toMatchObject({ message: 'Newer request failed' })
    expect(JSON.stringify(queryClient.getQueryCache().getAll())).not.toContain(signedUrl)
    expect(JSON.stringify(queryClient.getMutationCache().getAll())).not.toContain(signedUrl)
    expect(localStorageMock.setItem).not.toHaveBeenCalled()
    expect(sessionStorageMock.setItem).not.toHaveBeenCalled()
  })
})
