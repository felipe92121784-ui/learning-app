import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
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
import { ApiError } from '@/lib/api-client'
import {
  updateAccountPassword,
  type UpdateAccountPasswordInput,
} from './account-password-api'

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Informe a senha atual.'),
    newPassword: z
      .string()
      .min(8, 'A senha deve ter pelo menos 8 caracteres.')
      .max(32, 'A senha deve ter no máximo 32 caracteres.'),
    newPasswordConfirmation: z.string().min(1, 'Confirme a nova senha.'),
  })
  .refine(
    ({ newPassword, newPasswordConfirmation }) =>
      newPassword === newPasswordConfirmation,
    {
      message: 'As senhas não coincidem.',
      path: ['newPasswordConfirmation'],
    },
  )

function getPasswordError(error: unknown): string {
  if (error instanceof ApiError && error.status === 422) {
    return 'A senha atual está incorreta ou os dados são inválidos.'
  }

  return 'Não foi possível alterar a senha. Tente novamente.'
}

export function AccountPasswordForm() {
  const [isSuccessful, setIsSuccessful] = useState(false)
  const form = useForm<UpdateAccountPasswordInput>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      newPasswordConfirmation: '',
    },
  })
  const passwordMutation = useMutation({
    mutationFn: updateAccountPassword,
  })

  async function handleSubmit(input: UpdateAccountPasswordInput) {
    setIsSuccessful(false)

    try {
      await passwordMutation.mutateAsync(input)
      form.reset()
      setIsSuccessful(true)
    } catch {
      // The mutation state supplies the user-facing error below.
    }
  }

  return (
    <Form {...form}>
      <form
        aria-label="Alterar senha"
        className="space-y-5"
        noValidate
        onSubmit={form.handleSubmit(handleSubmit)}
      >
        <FormField
          control={form.control}
          name="currentPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Senha atual</FormLabel>
              <FormControl>
                <Input
                  autoComplete="current-password"
                  disabled={passwordMutation.isPending}
                  type="password"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nova senha</FormLabel>
              <FormControl>
                <Input
                  autoComplete="new-password"
                  disabled={passwordMutation.isPending}
                  type="password"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="newPasswordConfirmation"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirmar nova senha</FormLabel>
              <FormControl>
                <Input
                  autoComplete="new-password"
                  disabled={passwordMutation.isPending}
                  type="password"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {passwordMutation.isError ? (
          <Alert variant="destructive">
            <AlertDescription>
              {getPasswordError(passwordMutation.error)}
            </AlertDescription>
          </Alert>
        ) : null}
        {isSuccessful ? (
          <Alert>
            <AlertDescription>Senha alterada com sucesso.</AlertDescription>
          </Alert>
        ) : null}

        <Button disabled={passwordMutation.isPending} type="submit">
          {passwordMutation.isPending ? 'Alterando…' : 'Alterar senha'}
        </Button>
      </form>
    </Form>
  )
}
