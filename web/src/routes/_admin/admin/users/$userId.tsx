/* eslint-disable react/only-export-components */
import { useState } from 'react'
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
import {
  studentCourseAssociationsQueryOptions,
  useStudentCourseAssociationsQuery,
} from '@/features/access-rules/student-course-associations-queries'
import { AddStudentCourseDialog } from '@/features/users/add-student-course-dialog'
import { StudentCourseCards } from '@/features/users/student-course-cards'
import { StudentProfileCard } from '@/features/users/student-profile-card'

export const Route = createFileRoute('/_admin/admin/users/$userId')({
  loader: async ({ context, params }) => {
    const userId = Number(params.userId)
    const user = await context.queryClient.ensureQueryData(
      userQueryOptions(userId),
    )

    if (user.role === 'STUDENT') {
      await context.queryClient.prefetchQuery(
        studentCourseAssociationsQueryOptions(userId),
      )
    }
  },
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
        <div className="space-y-8">
          <StudentCourseDetails student={userQuery.data} />

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
        </div>
      )}
    </main>
  )
}

function StudentCourseDetails({
  student,
}: {
  student: NonNullable<ReturnType<typeof useUserQuery>['data']>
}) {
  const associationsQuery = useStudentCourseAssociationsQuery(student.id)
  const [addCourseOpen, setAddCourseOpen] = useState(false)
  const associationsReady = associationsQuery.isSuccess

  return (
    <>
      <StudentProfileCard
        courseCount={associationsQuery.data?.length ?? 0}
        student={student}
      />

      <section aria-labelledby="student-courses-heading" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold" id="student-courses-heading">
              Cursos atribuídos
            </h2>
            <p className="text-sm text-slate-600">
              Gerencie o acesso deste aluno por curso.
            </p>
          </div>
          <Button
            disabled={!associationsReady}
            onClick={() => setAddCourseOpen(true)}
            type="button"
          >
            Adicionar curso
          </Button>
        </div>

        {associationsQuery.isPending ? (
          <p className="text-sm text-slate-600">Carregando cursos…</p>
        ) : associationsQuery.isError ? (
          <Alert variant="destructive">
            <AlertDescription className="flex items-center justify-between gap-3">
              <span>Não foi possível carregar os cursos atribuídos. Tente novamente.</span>
              <Button
                onClick={() => void associationsQuery.refetch()}
                size="sm"
                type="button"
                variant="outline"
              >
                Tentar novamente
              </Button>
            </AlertDescription>
          </Alert>
        ) : associationsReady ? (
          <StudentCourseCards associations={associationsQuery.data} student={student} />
        ) : null}
      </section>

      {associationsReady ? (
        <AddStudentCourseDialog
          associations={associationsQuery.data}
          open={addCourseOpen}
          onOpenChange={setAddCourseOpen}
          studentId={student.id}
        />
      ) : null}
    </>
  )
}
