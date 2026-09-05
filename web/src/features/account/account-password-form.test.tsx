// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  RouterProvider,
} from '@tanstack/react-router'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/features/auth/auth-provider'
import { createAppRouter } from '@/router'

const student = {
  id: 7,
  fullName: 'Ada Student',
  email: 'ada@example.test',
  role: 'STUDENT' as const,
  status: 'ACTIVE' as const,
}

function renderAccountPage(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('innerWidth', 1024)
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const router = createAppRouter({
    history: createMemoryHistory({ initialEntries: ['/app/account'] }),
    isServer: false,
    origin: 'http://localhost',
    queryClient,
  })

  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  )
}

describe('account password form', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('is reachable from the authenticated navigation', async () => {
    renderAccountPage(
      vi
        .fn()
        .mockResolvedValue(Response.json({ data: { user: student } })),
    )

    expect(
      (await screen.findByRole('link', { name: 'Conta' })).getAttribute(
        'href',
      ),
    ).toBe('/app/account')
  })

  it('submits the current and confirmed new password to the account endpoint', async () => {
    const fetchMock = vi.fn().mockImplementation((input: string | URL) => {
      const url = String(input)

      if (url.endsWith('/account/profile')) {
        return Promise.resolve(Response.json({ data: { user: student } }))
      }

      if (url.endsWith('/account/password')) {
        return Promise.resolve(
          Response.json({ message: 'Password updated successfully' }),
        )
      }

      throw new Error(`Unexpected request: ${url}`)
    })
    renderAccountPage(fetchMock)

    fireEvent.change(await screen.findByLabelText('Senha atual'), {
      target: { value: 'current-password-123' },
    })
    fireEvent.change(screen.getByLabelText('Nova senha'), {
      target: { value: 'new-password-456' },
    })
    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), {
      target: { value: 'new-password-456' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Alterar senha' }),
    )

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const [url, request] = fetchMock.mock.calls[1] ?? []
    expect(url).toBe(
      'https://api.example.test/api/v1/account/password',
    )
    expect(request?.method).toBe('PATCH')
    expect(new Headers(request?.headers).get('Content-Type')).toBe(
      'application/json',
    )
    expect(request?.body).toBe(
      JSON.stringify({
        currentPassword: 'current-password-123',
        newPassword: 'new-password-456',
        newPasswordConfirmation: 'new-password-456',
      }),
    )
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Senha alterada com sucesso.',
    )
  })

  it('shows the API validation error when the current password is rejected', async () => {
    const fetchMock = vi.fn().mockImplementation((input: string | URL) => {
      const url = String(input)

      if (url.endsWith('/account/profile')) {
        return Promise.resolve(Response.json({ data: { user: student } }))
      }

      if (url.endsWith('/account/password')) {
        return Promise.resolve(
          Response.json(
            {
              errors: [
                {
                  field: 'currentPassword',
                  message: 'The current password is invalid',
                  rule: 'current_password',
                },
              ],
            },
            { status: 422 },
          ),
        )
      }

      throw new Error(`Unexpected request: ${url}`)
    })
    renderAccountPage(fetchMock)

    fireEvent.change(await screen.findByLabelText('Senha atual'), {
      target: { value: 'incorrect-password' },
    })
    fireEvent.change(screen.getByLabelText('Nova senha'), {
      target: { value: 'new-password-456' },
    })
    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), {
      target: { value: 'new-password-456' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Alterar senha' }),
    )

    expect((await screen.findByRole('alert')).textContent).toContain(
      'A senha atual está incorreta ou os dados são inválidos.',
    )
    expect(
      screen.getByRole('button', { name: 'Alterar senha' }),
    ).toHaveProperty('disabled', false)
  })
})
