/* eslint-disable react/only-export-components */
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { CreateUserForm } from '@/features/users/user-form'
import { useCreateUserMutation } from '@/features/users/users-queries'
import type { CreateUserInput } from '@/features/users/users-types'

export const Route = createFileRoute('/_admin/admin/users/new')({
  component: NewUserPage,
})

function NewUserPage() {
  const navigate = useNavigate()
  const createMutation = useCreateUserMutation()

  function handleSubmit(input: CreateUserInput) {
    createMutation.mutate(input, {
      onSuccess: () => void navigate({ to: '/admin/users' }),
    })
  }

  return (
    <main>
      <Button asChild className="mb-6" variant="ghost">
        <Link to="/admin/users">Voltar para usuários</Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>Novo aluno</CardTitle>
          <CardDescription>
            O aluno será criado ativo e poderá trocar a senha inicial depois.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateUserForm
            error={
              createMutation.isError
                ? 'Não foi possível criar o aluno. Revise os dados e tente novamente.'
                : null
            }
            isPending={createMutation.isPending}
            onSubmit={handleSubmit}
          />
        </CardContent>
      </Card>
    </main>
  )
}
