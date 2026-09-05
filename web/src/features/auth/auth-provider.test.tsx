import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { profileQueryKey } from './auth-api'
import { AuthProvider, useAuth } from './auth-provider'
import type { AuthUser } from './auth-types'

const student: AuthUser = {
  id: 7,
  fullName: 'Ada Student',
  email: 'ada@example.test',
  role: 'STUDENT',
  status: 'ACTIVE',
}

function AuthStateProbe() {
  const auth = useAuth()

  return (
    <output data-loading={String(auth.isLoading)}>
      {auth.user?.email ?? 'anonymous'}
    </output>
  )
}

describe('AuthProvider', () => {
  it('exposes the current user restored in the shared profile cache', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(profileQueryKey, student)

    const markup = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AuthStateProbe />
        </AuthProvider>
      </QueryClientProvider>,
    )

    expect(markup).toContain('data-loading="false"')
    expect(markup).toContain('ada@example.test')
  })
})
