/* eslint-disable react/only-export-components */
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/app')({
  component: AppPage,
})

function AppPage() {
  return (
    <main>
      <p className="text-sm font-medium text-slate-500">Portal</p>
      <h1 className="mt-2 text-3xl font-semibold">Sua área de aprendizagem</h1>
      <p className="mt-3 text-slate-600">
        Seus cursos e atividades aparecerão aqui.
      </p>
    </main>
  )
}
