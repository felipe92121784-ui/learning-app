/* eslint-disable react/only-export-components */
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { EditUserForm } from '@/features/users/user-form'
import {
  useUpdateUserMutation,
  useUserQuery,
  userQueryOptions,
} from '@/features/users/users-queries'
import type { UpdateUserInput } from '@/features/users/users-types'

export const Route = createFileRoute('/_admin/admin/users/$userId')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      userQueryOptions(Number(params.userId)),
    ),
  errorComponent: EditUserRouteError,
  component: EditUserPage,
})

function EditUserRouteError() {
  return (
    <main>
      <Alert variant="destructive">
        <AlertDescription>
          Não foi possível carregar o usuário. Tente novamente.
        </AlertDescription>
      </Alert>
    </main>
  )
}

function EditUserPage() {
  const { userId: userIdParam } = Route.useParams()
  const userId = Number(userIdParam)
  const navigate = useNavigate()
  const userQuery = useUserQuery(userId)
  const updateMutation = useUpdateUserMutation()

  function handleSubmit(input: UpdateUserInput) {
    updateMutation.mutate(
      { userId, input },
      { onSuccess: () => void navigate({ to: '/admin/users' }) },
    )
  }

  return (
    <main>
      <Button asChild className="mb-6" variant="ghost">
        <Link to="/admin/users">Voltar para usuários</Link>
      </Button>

      {userQuery.isPending ? (
        <p className="text-sm text-slate-600">Carregando usuário…</p>
      ) : userQuery.isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            Não foi possível carregar o usuário. Tente novamente.
          </AlertDescription>
        </Alert>
      ) : userQuery.data.role !== 'STUDENT' ? (
        <Alert>
          <AlertDescription>
            Apenas alunos podem ser editados nesta área.
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Editar aluno</CardTitle>
            <CardDescription>
              Altere o nome ou e-mail. A senha é gerenciada pelo próprio aluno.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EditUserForm
              error={
                updateMutation.isError
                  ? 'Não foi possível salvar o aluno. Revise os dados e tente novamente.'
                  : null
              }
              isPending={updateMutation.isPending}
              user={userQuery.data}
              onSubmit={handleSubmit}
            />
          </CardContent>
        </Card>
      )}
    </main>
  )
}
