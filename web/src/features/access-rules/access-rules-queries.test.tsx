// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  accessRulesQueryKeys,
  useUpsertAccessRuleMutation,
} from './access-rules-queries'

function harness() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  })
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
  return { queryClient, Wrapper }
}

describe('access-rule queries', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('refreshes direct rules and the effective summary after saving', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          data: {
            id: 4,
            userId: 12,
            resourceType: 'MODULE',
            resourceId: 7,
            capability: 'VIEW',
            effect: 'ALLOW',
            startsAt: null,
            expiresAt: null,
            createdAt: '2026-09-06T12:00:00.000Z',
            updatedAt: '2026-09-06T12:00:00.000Z',
          },
        }),
      ),
    )
    const { queryClient, Wrapper } = harness()
    const target = { userId: 12, resource: { type: 'MODULE' as const, id: 7 } }
    queryClient.setQueryData(accessRulesQueryKeys.direct(target), [])
    queryClient.setQueryData(accessRulesQueryKeys.effective(target), null)
    const mutation = renderHook(() => useUpsertAccessRuleMutation(), {
      wrapper: Wrapper,
    })

    await act(async () => {
      await mutation.result.current.mutateAsync({
        userId: 12,
        resourceType: 'MODULE',
        resourceId: 7,
        capability: 'VIEW',
        effect: 'ALLOW',
        startsAt: null,
        expiresAt: null,
      })
    })

    expect(
      queryClient.getQueryState(accessRulesQueryKeys.direct(target))
        ?.isInvalidated,
    ).toBe(true)
    expect(
      queryClient.getQueryState(accessRulesQueryKeys.effective(target))
        ?.isInvalidated,
    ).toBe(true)
  })
})
