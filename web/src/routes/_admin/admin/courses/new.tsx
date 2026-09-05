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
import { CreateCourseForm } from '@/features/courses/course-form'
import { useCreateCourseMutation } from '@/features/courses/courses-queries'
import type { CreateCourseInput } from '@/features/courses/courses-types'

export const Route = createFileRoute('/_admin/admin/courses/new')({
  component: NewCoursePage,
})

function NewCoursePage() {
  const navigate = useNavigate()
  const createMutation = useCreateCourseMutation()

  function handleSubmit(input: CreateCourseInput) {
    createMutation.mutate(input, {
      onSuccess: (course) =>
        void navigate({
          to: '/admin/courses/$courseId',
          params: { courseId: String(course.id) },
        }),
    })
  }

  return (
    <main>
      <Button asChild className="mb-6" variant="ghost">
        <Link to="/admin/courses">Voltar para cursos</Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>Novo curso</CardTitle>
          <CardDescription>
            O curso será criado como rascunho e poderá ser publicado depois.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateCourseForm
            error={
              createMutation.isError
                ? 'Não foi possível criar o curso. Revise os dados e tente novamente.'
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
