import { useNavigate } from '@tanstack/react-router'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { CreateCourseForm } from './course-form'
import { useCreateCourseMutation } from './courses-queries'
import type { CreateCourseInput } from './courses-types'

export function CreateCourseDrawer({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b pr-12">
          <SheetTitle>Novo curso</SheetTitle>
          <SheetDescription>
            O curso será criado como rascunho e poderá ser publicado depois.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <CreateCourseForm
            error={
              createMutation.isError
                ? 'Não foi possível criar o curso. Revise os dados e tente novamente.'
                : null
            }
            isPending={createMutation.isPending}
            onSubmit={handleSubmit}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
