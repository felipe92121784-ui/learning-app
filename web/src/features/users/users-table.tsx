import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { ManagedUser, UserStatus } from './users-types'

interface UsersTableProps {
  users: ManagedUser[]
  pendingUserId: number | null
  statusError: string | null
  onStatusChange: (userId: number, status: UserStatus) => void
}

function StatusBadge({ status }: { status: UserStatus }) {
  return (
    <Badge variant={status === 'ACTIVE' ? 'secondary' : 'destructive'}>
      {status === 'ACTIVE' ? 'Ativo' : 'Bloqueado'}
    </Badge>
  )
}

function StatusAction({
  isPending,
  onStatusChange,
  user,
}: {
  isPending: boolean
  onStatusChange: UsersTableProps['onStatusChange']
  user: ManagedUser
}) {
  const nextStatus: UserStatus =
    user.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE'
  const actionLabel = nextStatus === 'BLOCKED' ? 'Bloquear' : 'Ativar'
  const actionNoun = nextStatus === 'BLOCKED' ? 'bloqueio' : 'ativação'

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button disabled={isPending} size="sm" variant="outline">
          {isPending ? 'Alterando…' : actionLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{actionLabel} aluno</DialogTitle>
          <DialogDescription>
            {nextStatus === 'BLOCKED'
              ? `${user.fullName} perderá o acesso imediatamente.`
              : `${user.fullName} poderá voltar a acessar a plataforma.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancelar
            </Button>
          </DialogClose>
          <DialogClose asChild>
            <Button
              type="button"
              variant={nextStatus === 'BLOCKED' ? 'destructive' : 'default'}
              onClick={() => onStatusChange(user.id, nextStatus)}
            >
              Confirmar {actionNoun}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function UsersTable({
  users,
  pendingUserId,
  statusError,
  onStatusChange,
}: UsersTableProps) {
  return (
    <div className="space-y-4">
      {statusError ? (
        <Alert variant="destructive">
          <AlertDescription>{statusError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="rounded-lg border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell className="py-8 text-center" colSpan={5}>
                  Nenhum usuário encontrado.
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.fullName}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    {user.role === 'ADMIN' ? 'Administrador' : 'Aluno'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={user.status} />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {user.role === 'STUDENT' ? (
                        <>
                          <Button asChild size="sm" variant="ghost">
                            <a href={`/admin/users/${user.id}`}>Editar</a>
                          </Button>
                          <StatusAction
                            isPending={pendingUserId === user.id}
                            onStatusChange={onStatusChange}
                            user={user}
                          />
                        </>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
