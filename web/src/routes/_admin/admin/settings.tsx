/* eslint-disable react/only-export-components */
import { createFileRoute } from '@tanstack/react-router'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { UploadSettingsForm } from '@/features/settings/upload-settings-form'
import {
  uploadSettingsQueryOptions,
  useUploadSettingsQuery,
} from '@/features/settings/upload-settings-queries'

export const Route = createFileRoute('/_admin/admin/settings')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(uploadSettingsQueryOptions()),
  errorComponent: UploadSettingsRouteError,
  component: UploadSettingsPage,
})

function UploadSettingsRouteError() {
  return (
    <main>
      <Alert variant="destructive">
        <AlertDescription>
          Não foi possível carregar as configurações. Tente novamente.
        </AlertDescription>
      </Alert>
    </main>
  )
}

function UploadSettingsPage() {
  const settingsQuery = useUploadSettingsQuery()

  return (
    <main className="space-y-8">
      <div>
        <p className="text-sm font-medium text-slate-500">Administração</p>
        <h1 className="mt-2 text-3xl font-semibold">Configurações</h1>
        <p className="mt-3 text-slate-600">
          Defina os limites de tamanho para os materiais enviados pelos administradores.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Limites de upload</CardTitle>
          <CardDescription>
            Informe valores inteiros entre 1 MB e 1024 MB para PDF, imagens e ZIP.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {settingsQuery.isPending ? (
            <p aria-live="polite" className="text-sm text-muted-foreground">
              Carregando configurações…
            </p>
          ) : settingsQuery.isError ? (
            <Alert variant="destructive">
              <AlertDescription>
                Não foi possível carregar as configurações. Tente novamente.
              </AlertDescription>
            </Alert>
          ) : (
            <UploadSettingsForm settings={settingsQuery.data} />
          )}
        </CardContent>
      </Card>
    </main>
  )
}
