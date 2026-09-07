// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EffectiveAccessSummary } from './effective-access-summary'

describe('EffectiveAccessSummary', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('shows only the current capability decisions and their sources', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          data: {
            view: {
              allowed: true,
              decision: 'ALLOW',
              source: 'MODULE',
              ruleId: 4,
            },
            download: {
              allowed: false,
              decision: 'DENY',
              source: 'DEFAULT',
              ruleId: null,
            },
          },
        }),
      ),
    )
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <EffectiveAccessSummary
          resource={{ type: 'MODULE', id: 7 }}
          userId={12}
        />
      </QueryClientProvider>,
    )

    expect(await screen.findByText('Permitir')).toBeTruthy()
    expect(screen.getByText('Negar')).toBeTruthy()
    expect(screen.getByText('Módulo')).toBeTruthy()
    expect(screen.getByText('Padrão')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })
})
