// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccessRuleForm } from './access-rule-form'
import { accessRulesQueryKeys } from './access-rules-queries'

const viewRule = {
  id: 4,
  userId: 12,
  resourceType: 'MODULE' as const,
  resourceId: 7,
  capability: 'VIEW' as const,
  effect: 'ALLOW' as const,
  startsAt: '2026-09-06T12:00:00.1Z',
  expiresAt: '2026-09-07T12:00:00.100Z',
  createdAt: '2026-09-06T12:00:00.000Z',
  updatedAt: '2026-09-06T12:00:00.000Z',
}

const downloadRule = {
  ...viewRule,
  id: 5,
  capability: 'DOWNLOAD' as const,
  effect: 'DENY' as const,
  startsAt: '2026-09-08T12:00:00.01Z',
  expiresAt: '2026-09-09T12:00:00.010Z',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

function renderForm({
  resourceId = 7,
  onSaved,
  queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  }),
}: {
  resourceId?: number
  onSaved?: () => void
  queryClient?: QueryClient
} = {}) {
  const renderResult = render(
    <QueryClientProvider client={queryClient}>
      <AccessRuleForm
        onSaved={onSaved}
        resource={{ type: 'MODULE', id: resourceId }}
        userId={12}
      />
    </QueryClientProvider>,
  )
  return {
    ...renderResult,
    queryClient,
    rerenderFor(resourceId: number) {
      renderResult.rerender(
        <QueryClientProvider client={queryClient}>
          <AccessRuleForm
            onSaved={onSaved}
            resource={{ type: 'MODULE', id: resourceId }}
            userId={12}
          />
        </QueryClientProvider>,
      )
    },
  }
}

function putBodies(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls
    .filter(([, request]) => request?.method === 'PUT')
    .map(([, request]) => request?.body)
}

function saveButton() {
  return screen.getByRole('button', { name: 'Salvar permissões' })
}

describe('AccessRuleForm', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('cannot save before direct rules load or while a new target loads', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    const initialRules = deferred<Response>()
    const nextTargetRules = deferred<Response>()
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(initialRules.promise)
      .mockReturnValueOnce(nextTargetRules.promise)
    vi.stubGlobal('fetch', fetchMock)
    const form = renderForm()

    expect(saveButton()).toHaveProperty('disabled', true)
    expect(screen.getByLabelText('Início da visualização (UTC ISO)')).toHaveProperty(
      'disabled',
      true,
    )
    fireEvent.click(saveButton())
    expect(putBodies(fetchMock)).toEqual([])

    initialRules.resolve(Response.json({ data: [viewRule] }))
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false))
    expect(screen.getByLabelText('Início da visualização (UTC ISO)')).toHaveProperty(
      'value',
      '2026-09-06T12:00:00.1Z',
    )

    form.rerenderFor(8)
    expect(saveButton()).toHaveProperty('disabled', true)
    expect(screen.getByLabelText('Início da visualização (UTC ISO)')).toHaveProperty(
      'value',
      '',
    )
    nextTargetRules.resolve(Response.json({ data: [] }))
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false))
  })

  it('disables submission and reports a direct-rule loading failure', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ message: 'Failed' }, { status: 500 })),
    )
    renderForm()

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Não foi possível carregar as regras diretas.',
    )
    expect(saveButton()).toHaveProperty('disabled', true)
  })

  it('preserves a separate UTC window for each capability when saving', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ data: [viewRule, downloadRule] }))
      .mockResolvedValue(Response.json({ data: viewRule }))
    vi.stubGlobal('fetch', fetchMock)
    renderForm()

    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false))
    expect(screen.getByLabelText('Início da visualização (UTC ISO)')).toHaveProperty(
      'value',
      viewRule.startsAt,
    )
    expect(screen.getByLabelText('Fim da visualização (UTC ISO)')).toHaveProperty(
      'value',
      viewRule.expiresAt,
    )
    expect(screen.getByLabelText('Início do download (UTC ISO)')).toHaveProperty(
      'value',
      downloadRule.startsAt,
    )
    expect(screen.getByLabelText('Fim do download (UTC ISO)')).toHaveProperty(
      'value',
      downloadRule.expiresAt,
    )

    fireEvent.click(saveButton())
    await waitFor(() => expect(putBodies(fetchMock)).toHaveLength(2))
    expect(putBodies(fetchMock)).toEqual([
      JSON.stringify({
        userId: 12,
        resourceType: 'MODULE',
        resourceId: 7,
        capability: 'VIEW',
        effect: 'ALLOW',
        startsAt: viewRule.startsAt,
        expiresAt: viewRule.expiresAt,
      }),
      JSON.stringify({
        userId: 12,
        resourceType: 'MODULE',
        resourceId: 7,
        capability: 'DOWNLOAD',
        effect: 'DENY',
        startsAt: downloadRule.startsAt,
        expiresAt: downloadRule.expiresAt,
      }),
    ])
  })

  it('preserves unsaved edits when direct rules refetch in the background', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ data: [viewRule] }))
      .mockResolvedValueOnce(
        Response.json({
          data: [{ ...viewRule, startsAt: '2026-09-10T12:00:00.1Z' }],
        }),
      )
    vi.stubGlobal('fetch', fetchMock)
    const { queryClient } = renderForm()

    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false))
    fireEvent.change(screen.getByLabelText('Início da visualização (UTC ISO)'), {
      target: { value: '2026-09-11T12:00:00.1Z' },
    })
    await queryClient.invalidateQueries({
      queryKey: accessRulesQueryKeys.direct({
        userId: 12,
        resource: { type: 'MODULE', id: 7 },
      }),
    })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(screen.getByLabelText('Início da visualização (UTC ISO)')).toHaveProperty(
      'value',
      '2026-09-11T12:00:00.1Z',
    )
  })

  it('hydrates a stale cached target from its fresh response before enabling save', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    const target = { userId: 12, resource: { type: 'MODULE' as const, id: 7 } }
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    })
    queryClient.setQueryData(accessRulesQueryKeys.direct(target), [
      { ...viewRule, startsAt: '2026-09-01T12:00:00.1Z' },
    ])
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ data: [{ ...viewRule, startsAt: '2026-09-12T12:00:00.1Z' }] }),
    )
    vi.stubGlobal('fetch', fetchMock)
    renderForm({ queryClient })

    expect(saveButton()).toHaveProperty('disabled', true)
    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false))
    expect(screen.getByLabelText('Início da visualização (UTC ISO)')).toHaveProperty(
      'value',
      '2026-09-12T12:00:00.1Z',
    )
  })

  it('keeps saving disabled until both writes settle and reports a partial failure', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    const secondWrite = deferred<Response>()
    let putCount = 0
    const fetchMock = vi.fn((_: string, request?: RequestInit) => {
      if (request?.method !== 'PUT') {
        return Promise.resolve(Response.json({ data: [] }))
      }
      putCount += 1
      return putCount === 1
        ? Promise.resolve(Response.json({ data: viewRule }))
        : secondWrite.promise
    })
    vi.stubGlobal('fetch', fetchMock)
    const onSaved = vi.fn()
    renderForm({ onSaved })

    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false))
    fireEvent.click(saveButton())
    await waitFor(() => expect(putBodies(fetchMock)).toHaveLength(2))
    expect(screen.getByRole('button', { name: 'Salvando…' })).toHaveProperty(
      'disabled',
      true,
    )

    secondWrite.reject(new Error('Network failure'))
    expect(
      await screen.findByText(/Não foi possível salvar todas as permissões\./),
    ).toBeTruthy()
    expect(onSaved).not.toHaveBeenCalled()
    expect(saveButton()).toHaveProperty('disabled', false)
  })

  it('rejects normalized invalid dates and accepts UTC ISO fractions from one to three digits', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: [] }))
    vi.stubGlobal('fetch', fetchMock)
    renderForm()

    await waitFor(() => expect(saveButton()).toHaveProperty('disabled', false))
    fireEvent.change(screen.getByLabelText('Início da visualização (UTC ISO)'), {
      target: { value: '2026-02-30T12:00:00.1Z' },
    })
    fireEvent.click(saveButton())
    expect(await screen.findByText('Informe uma data UTC ISO válida.')).toBeTruthy()
    expect(putBodies(fetchMock)).toEqual([])

    fireEvent.change(screen.getByLabelText('Início da visualização (UTC ISO)'), {
      target: { value: '2026-02-28T12:00:00.1Z' },
    })
    fireEvent.click(saveButton())
    await waitFor(() => expect(putBodies(fetchMock)).toHaveLength(2))
  })
})
