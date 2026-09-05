import { useState, type PropsWithChildren } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useAuth } from './auth-provider'

interface AuthenticatedShellProps extends PropsWithChildren {
  area: 'app' | 'admin'
}

export function AuthenticatedShell({
  area,
  children,
}: AuthenticatedShellProps) {
  const auth = useAuth()
  const navigate = useNavigate()
  const [logoutError, setLogoutError] = useState<string | null>(null)

  async function handleLogout() {
    setLogoutError(null)

    try {
      await auth.logout()
      await navigate({ to: '/login', replace: true })
    } catch {
      setLogoutError('Não foi possível sair. Tente novamente.')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <p className="font-semibold">Ideal Learning</p>
            <p className="text-sm text-slate-600">{auth.user?.fullName}</p>
          </div>
          <nav aria-label="Navegação principal" className="flex items-center gap-4">
            <Link
              className={area === 'app' ? 'font-semibold' : 'text-slate-600'}
              to="/app"
            >
              Portal
            </Link>
            <Link className="text-slate-600" to="/app/account">
              Conta
            </Link>
            {auth.user?.role === 'ADMIN' ? (
              <Link
                className={
                  area === 'admin' ? 'font-semibold' : 'text-slate-600'
                }
                to="/admin"
              >
                Administração
              </Link>
            ) : null}
            <button
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-60"
              disabled={auth.isLoading}
              onClick={() => void handleLogout()}
              type="button"
            >
              Sair
            </button>
          </nav>
        </div>
        {logoutError ? (
          <p
            className="mx-auto max-w-5xl px-6 pb-3 text-sm text-red-700"
            role="alert"
          >
            {logoutError}
          </p>
        ) : null}
      </header>
      {children}
    </div>
  )
}
