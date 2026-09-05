import { zodResolver } from '@hookform/resolvers/zod'
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
  CreateUserInput,
  ManagedUser,
  UpdateUserInput,
} from './users-types'

const identityFields = {
  fullName: z
    .string()
    .trim()
    .min(2, 'Informe pelo menos 2 caracteres.')
    .max(120, 'Use no máximo 120 caracteres.'),
  email: z
    .email('Informe um e-mail válido.')
    .trim()
    .max(254, 'Use no máximo 254 caracteres.'),
}

const createUserSchema = z.object({
  ...identityFields,
  password: z
    .string()
    .min(8, 'A senha deve ter pelo menos 8 caracteres.')
    .max(32, 'A senha deve ter no máximo 32 caracteres.'),
})

const updateUserSchema = z.object(identityFields)

interface FormStateProps {
  error: string | null
  isPending: boolean
}

interface CreateUserFormProps extends FormStateProps {
  onSubmit: (input: CreateUserInput) => Promise<void> | void
}

export function CreateUserForm({
  error,
  isPending,
  onSubmit,
}: CreateUserFormProps) {
  const form = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { fullName: '', email: '', password: '' },
  })

  return (
    <Form {...form}>
      <form
        aria-label="Criar aluno"
        className="space-y-5"
        noValidate
        onSubmit={form.handleSubmit((input) => onSubmit(input))}
      >
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome completo</FormLabel>
              <FormControl>
                <Input autoComplete="name" disabled={isPending} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>E-mail</FormLabel>
              <FormControl>
                <Input
                  autoComplete="email"
                  disabled={isPending}
                  type="email"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Senha inicial</FormLabel>
              <FormControl>
                <Input
                  autoComplete="new-password"
                  disabled={isPending}
                  type="password"
                  {...field}
                />
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
          {isPending ? 'Criando…' : 'Criar aluno'}
        </Button>
      </form>
    </Form>
  )
}

interface EditUserFormProps extends FormStateProps {
  user: ManagedUser
  onSubmit: (input: UpdateUserInput) => Promise<void> | void
}

export function EditUserForm({
  error,
  isPending,
  user,
  onSubmit,
}: EditUserFormProps) {
  const form = useForm<UpdateUserInput>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: { fullName: user.fullName, email: user.email },
  })

  return (
    <Form {...form}>
      <form
        aria-label="Editar aluno"
        className="space-y-5"
        noValidate
        onSubmit={form.handleSubmit((input) => onSubmit(input))}
      >
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome completo</FormLabel>
              <FormControl>
                <Input autoComplete="name" disabled={isPending} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>E-mail</FormLabel>
              <FormControl>
                <Input
                  autoComplete="email"
                  disabled={isPending}
                  type="email"
                  {...field}
                />
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
          {isPending ? 'Salvando…' : 'Salvar alterações'}
        </Button>
      </form>
    </Form>
  )
}
