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
import type {
  CourseModule,
  CreateModuleInput,
  UpdateModuleInput,
} from './courses-types'

const moduleSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, 'Informe pelo menos 2 caracteres.')
    .max(160, 'Use no máximo 160 caracteres.'),
  description: z
    .string()
    .trim()
    .max(2000, 'Use no máximo 2000 caracteres.'),
})

type ModuleFormValues = z.infer<typeof moduleSchema>

function moduleFormValues(module?: CourseModule): ModuleFormValues {
  return {
    title: module?.title ?? '',
    description: module?.description ?? '',
  }
}

interface ModuleFormProps {
  error: string | null
  isPending: boolean
  module?: CourseModule
  onSubmit: (
    input: CreateModuleInput | UpdateModuleInput,
  ) => Promise<void> | void
}

export function ModuleForm({
  error,
  isPending,
  module,
  onSubmit,
}: ModuleFormProps) {
  const isEditing = Boolean(module)
  const moduleId = module?.id
  const moduleTitle = module?.title
  const moduleDescription = module?.description
  const form = useForm<ModuleFormValues>({
    resolver: zodResolver(moduleSchema),
    defaultValues: moduleFormValues(module),
  })

  useEffect(() => {
    form.reset({
      title: moduleTitle ?? '',
      description: moduleDescription ?? '',
    })
  }, [form, moduleDescription, moduleId, moduleTitle])

  return (
    <Form {...form}>
      <form
        aria-label={isEditing ? 'Editar módulo' : 'Adicionar módulo'}
        className="space-y-5"
        noValidate
        onSubmit={form.handleSubmit((input) =>
          onSubmit({
            title: input.title,
            ...(isEditing
              ? { description: input.description || null }
              : input.description
                ? { description: input.description }
                : {}),
          }),
        )}
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
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Button disabled={isPending} type="submit">
          {isPending
            ? 'Salvando…'
            : isEditing
              ? 'Salvar módulo'
              : 'Adicionar módulo'}
        </Button>
      </form>
    </Form>
  )
}
