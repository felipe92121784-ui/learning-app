/* eslint-disable react/only-export-components */
import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { LoginForm } from '@/features/auth/login-form'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  getLoginDestination,
  redirectAuthenticatedUser,
} from '@/features/auth/auth-guards'
import { profileQueryOptions } from '@/features/auth/auth-api'
import { useAuth } from '@/features/auth/auth-provider'
import type { LoginCredentials } from '@/features/auth/auth-types'

interface LoginSearch {
  redirect?: string
}

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(
      profileQueryOptions(),
    )
    redirectAuthenticatedUser(user)
  },
  component: LoginPage,
})

function LoginPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const search = Route.useSearch()
  const [error, setError] = useState<string | null>(null)

  async function handleLogin(credentials: LoginCredentials) {
    setError(null)

    try {
      const user = await auth.login(credentials)
      await navigate({
        to: getLoginDestination(user, search.redirect),
        replace: true,
      })
    } catch {
      setError('Não foi possível entrar. Verifique suas credenciais.')
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardDescription>Ideal Learning</CardDescription>
          <CardTitle className="text-2xl">Entre na sua conta</CardTitle>
        </CardHeader>
        <CardContent>
          <LoginForm
            error={error}
            isPending={auth.isLoading}
            onSubmit={handleLogin}
          />
        </CardContent>
      </Card>
    </main>
  )
}
