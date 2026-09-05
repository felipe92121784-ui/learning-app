/* eslint-disable react/only-export-components */
import { createFileRoute, Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_admin/admin/')({
  component: AdminPage,
})

function AdminPage() {
  return (
    <main>
      <p className="text-sm font-medium text-slate-500">Administração</p>
      <h1 className="mt-2 text-3xl font-semibold">Painel administrativo</h1>
      <p className="mt-3 text-slate-600">
        Gerencie os alunos e o acesso à plataforma.
      </p>
      <Button asChild className="mt-6">
        <Link to="/admin/users">Gerenciar usuários</Link>
      </Button>
    </main>
  )
}
