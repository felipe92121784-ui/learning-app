/* eslint-disable react/only-export-components */
import { useState } from 'react'
import {
  createFileRoute,
  Outlet,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import { LogOut } from 'lucide-react'
import {
  AppSidebar,
  AppSidebarTrigger,
} from '@/components/layout/app-sidebar'
import { useSessionSidebarCollapsed } from '@/components/layout/sidebar-session'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { CardDescription, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { profileQueryOptions } from '@/features/auth/auth-api'
import { requireAdminUser } from '@/features/auth/auth-guards'
import { useAuth } from '@/features/auth/auth-provider'
import { adminNavigationItems } from '@/features/layout/admin-navigation'

export const Route = createFileRoute('/_admin')({
  beforeLoad: async ({ context, location }) => {
    const user = await context.queryClient.ensureQueryData(
      profileQueryOptions(),
    )

    return { user: requireAdminUser(user, location.href) }
  },
  component: AdminLayout,
})

function AdminLayout() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useSessionSidebarCollapsed(
    'ideal-learning:sidebar-collapsed',
  )
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const currentPath = useRouterState({
    select: (state) => state.location.pathname,
  })
  const initials = auth.user?.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((name) => name[0]?.toUpperCase())
    .join('')

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
    <AppSidebar
      brand="Ideal Learning"
      collapsed={collapsed}
      currentPath={currentPath}
      items={adminNavigationItems}
      onCollapsedChange={setCollapsed}
    >
      <header className="flex h-16 items-center justify-between gap-4 border-b px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <AppSidebarTrigger />
          <div className="min-w-0">
            <CardTitle className="truncate">Administração</CardTitle>
            <CardDescription className="hidden truncate sm:block">
              Gerencie a plataforma
            </CardDescription>
          </div>
        </div>

        {auth.user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={`Abrir menu da conta de ${auth.user.fullName}`}
                className="h-10 gap-2 px-2 sm:px-3"
                variant="ghost"
              >
                <Avatar>
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <span className="hidden max-w-40 truncate sm:inline">
                  {auth.user.fullName}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>
                <span className="block truncate">{auth.user.fullName}</span>
                <CardDescription className="truncate">
                  {auth.user.email}
                </CardDescription>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={auth.isLoading}
                onSelect={() => void handleLogout()}
              >
                <LogOut aria-hidden="true" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </header>
      {logoutError ? (
        <Alert
          className="px-4 py-2 sm:px-6"
          presentation="banner"
          variant="destructive"
        >
          <AlertDescription>{logoutError}</AlertDescription>
        </Alert>
      ) : null}
      <div className="w-full">
        <div
          className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
          data-testid="application-content"
        >
          <Outlet />
        </div>
      </div>
    </AppSidebar>
  )
}
