import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  Course,
  CourseStatus,
  CreateCourseInput,
  UpdateCourseInput,
} from './courses-types'

const courseSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, 'Informe pelo menos 2 caracteres.')
    .max(160, 'Use no máximo 160 caracteres.'),
  description: z
    .string()
    .trim()
    .max(2000, 'Use no máximo 2000 caracteres.'),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
})

type CourseFormValues = z.infer<typeof courseSchema>

interface CourseFormInput {
  title: string
  description?: string | null
  status?: CourseStatus
}

interface FormStateProps {
  error: string | null
  isPending: boolean
}

interface CourseFormProps extends FormStateProps {
  course?: Course
  onSubmit: (input: CourseFormInput) => Promise<void> | void
}

function cleanDescription(description: string): string | undefined {
  return description || undefined
}

function courseFormValues(course?: Course): CourseFormValues {
  return {
    title: course?.title ?? '',
    description: course?.description ?? '',
    status: course?.status,
  }
}

export function CourseForm({
  course,
  error,
  isPending,
  onSubmit,
}: CourseFormProps) {
  const isEditing = Boolean(course)
  const courseId = course?.id
  const courseTitle = course?.title
  const courseDescription = course?.description
  const courseStatus = course?.status
  const form = useForm<CourseFormValues>({
    resolver: zodResolver(courseSchema),
    defaultValues: courseFormValues(course),
  })

  useEffect(() => {
    form.reset({
      title: courseTitle ?? '',
      description: courseDescription ?? '',
      status: courseStatus,
    })
  }, [courseDescription, courseId, courseStatus, courseTitle, form])

  return (
    <Form {...form}>
      <form
        aria-label={isEditing ? 'Editar curso' : 'Criar curso'}
        className="space-y-5"
        noValidate
        onSubmit={form.handleSubmit((input) => {
          const description = cleanDescription(input.description)
          const baseInput = {
            title: input.title,
            ...(description
              ? { description }
              : {}),
          }
          onSubmit(
            isEditing
              ? { ...baseInput, description: description ?? null, status: input.status }
              : baseInput,
          )
        })}
      >
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Título</FormLabel>
              <FormControl>
                <Input autoComplete="off" disabled={isPending} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descrição</FormLabel>
              <FormControl>
                <Input autoComplete="off" disabled={isPending} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {isEditing ? (
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select
                  disabled={isPending}
                  onValueChange={field.onChange}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger aria-label="Status">
                      <SelectValue placeholder="Selecione o status" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="DRAFT">Rascunho</SelectItem>
                    <SelectItem value="PUBLISHED">Publicado</SelectItem>
                    <SelectItem value="ARCHIVED">Arquivado</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Button disabled={isPending} type="submit">
          {isPending
            ? isEditing
              ? 'Salvando…'
              : 'Criando…'
            : isEditing
              ? 'Salvar alterações'
              : 'Criar curso'}
        </Button>
      </form>
    </Form>
  )
}

interface CreateCourseFormProps extends FormStateProps {
  onSubmit: (input: CreateCourseInput) => Promise<void> | void
}

export function CreateCourseForm({ onSubmit, ...props }: CreateCourseFormProps) {
  return (
    <CourseForm
      {...props}
      onSubmit={({ description, title }) =>
        onSubmit({ title, ...(typeof description === 'string' ? { description } : {}) })
      }
    />
  )
}

interface EditCourseFormProps extends FormStateProps {
  course: Course
  onSubmit: (input: UpdateCourseInput) => Promise<void> | void
}

export function EditCourseForm({ onSubmit, ...props }: EditCourseFormProps) {
  return <CourseForm {...props} onSubmit={onSubmit} />
}
