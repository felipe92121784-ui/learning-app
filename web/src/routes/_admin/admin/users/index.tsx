/* eslint-disable react/only-export-components */
import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useUpdateUserStatusMutation,
  useUsersQuery,
  usersQueryOptions,
} from '@/features/users/users-queries'
import { UsersTable } from '@/features/users/users-table'
import type { UserStatus } from '@/features/users/users-types'

type StatusFilter = 'ALL' | UserStatus

export const Route = createFileRoute('/_admin/admin/users/')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(usersQueryOptions()),
  errorComponent: UsersRouteError,
  component: UsersPage,
})

function UsersRouteError() {
  return (
    <main>
      <Alert variant="destructive">
        <AlertDescription>
          Não foi possível carregar os usuários. Tente novamente.
        </AlertDescription>
      </Alert>
    </main>
  )
}

function UsersPage() {
  const usersQuery = useUsersQuery()
  const statusMutation = useUpdateUserStatusMutation()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [statusError, setStatusError] = useState<string | null>(null)

  const users = (usersQuery.data ?? []).filter(
    (user) => statusFilter === 'ALL' || user.status === statusFilter,
  )

  async function handleStatusChange(userId: number, status: UserStatus) {
    setStatusError(null)

    try {
      await statusMutation.mutateAsync({ userId, status })
    } catch {
      setStatusError('Não foi possível alterar o status. Tente novamente.')
    }
  }

  return (
    <main>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Administração</p>
          <h1 className="mt-2 text-3xl font-semibold">Usuários</h1>
          <p className="mt-3 text-slate-600">
            Crie alunos e controle o acesso à plataforma.
          </p>
        </div>
        <Button asChild>
          <Link to="/admin/users/new">Novo aluno</Link>
        </Button>
      </div>

      <div className="mt-8 flex items-center gap-3">
        <Label htmlFor="status-filter">Filtrar por status</Label>
        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as StatusFilter)}
        >
          <SelectTrigger id="status-filter" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos</SelectItem>
            <SelectItem value="ACTIVE">Ativos</SelectItem>
            <SelectItem value="BLOCKED">Bloqueados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-6">
        {usersQuery.isPending ? (
          <p className="text-sm text-slate-600">Carregando usuários…</p>
        ) : usersQuery.isError ? (
          <Alert variant="destructive">
            <AlertDescription>
              Não foi possível carregar os usuários. Tente novamente.
            </AlertDescription>
          </Alert>
        ) : (
          <UsersTable
            pendingUserId={
              statusMutation.isPending
                ? (statusMutation.variables?.userId ?? null)
                : null
            }
            statusError={statusError}
            users={users}
            onStatusChange={(userId, status) =>
              void handleStatusChange(userId, status)
            }
          />
        )}
      </div>
    </main>
  )
}
