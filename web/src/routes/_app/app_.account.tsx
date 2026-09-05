/* eslint-disable react/only-export-components */
import { createFileRoute } from '@tanstack/react-router'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AccountPasswordForm } from '@/features/account/account-password-form'

export const Route = createFileRoute('/_app/app_/account')({
  component: AccountPage,
})

function AccountPage() {
  return (
    <main>
      <p className="text-sm font-medium text-slate-500">Sua conta</p>
      <h1 className="mt-2 text-3xl font-semibold">Conta</h1>
      <p className="mt-3 text-slate-600">
        Atualize sua senha de acesso com segurança.
      </p>

      <Card className="mt-8 max-w-3xl">
        <CardHeader>
          <CardTitle>Alterar senha</CardTitle>
          <CardDescription>
            Confirme sua senha atual e escolha uma nova senha de 8 a 32
            caracteres.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AccountPasswordForm />
        </CardContent>
      </Card>
    </main>
  )
}
