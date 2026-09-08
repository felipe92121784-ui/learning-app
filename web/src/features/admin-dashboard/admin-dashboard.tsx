import { BookOpen, Download, Eye, GraduationCap, Users } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAdminDashboardQuery } from './admin-dashboard-queries'
import type { AdminActivityAction } from './admin-dashboard-types'

const number = new Intl.NumberFormat('pt-BR')
const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

function actionLabel(action: AdminActivityAction) {
  return action === 'DOWNLOAD_MATERIAL' ? 'baixou' : 'visualizou'
}

function ActivityIcon({ action }: { action: AdminActivityAction }) {
  const Icon = action === 'DOWNLOAD_MATERIAL' ? Download : Eye
  return <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
}

export function AdminDashboardView() {
  const dashboard = useAdminDashboardQuery()

  if (dashboard.isPending) {
    return <p className="text-sm text-muted-foreground">Carregando visão geral…</p>
  }

  if (dashboard.isError || !dashboard.data) {
    return <p role="alert" className="text-sm text-destructive">Não foi possível carregar a visão geral. Tente novamente.</p>
  }

  const { summary, recentActivities, topMaterials } = dashboard.data
  const metrics = [
    { label: 'Cursos', value: summary.totalCourses, detail: `${summary.publishedCourses} publicados`, icon: BookOpen },
    { label: 'Alunos ativos', value: summary.activeStudents, detail: 'com acesso à plataforma', icon: Users },
    { label: 'Matrículas ativas', value: summary.activeEnrollments, detail: 'dentro do período de acesso', icon: GraduationCap },
    { label: 'Atividades em 30 dias', value: summary.materialActivitiesLast30Days, detail: 'visualizações e downloads', icon: Eye },
  ]

  return (
    <main className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Administração</p>
          <h1 className="mt-2 text-3xl font-semibold">Painel administrativo</h1>
          <p className="mt-3 text-muted-foreground">Acompanhe alunos, cursos e o uso dos materiais.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link to="/admin/courses/new">Novo curso</Link></Button>
          <Button asChild><Link to="/admin/users/new">Novo aluno</Link></Button>
        </div>
      </div>

      <section aria-label="Resumo da plataforma" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, detail, icon: Icon }) => (
          <Card key={label} className="gap-3 py-5">
            <CardHeader className="px-5"><CardDescription className="flex items-center justify-between">{label}<Icon aria-hidden="true" className="size-4" /></CardDescription></CardHeader>
            <CardContent className="px-5"><p className="text-3xl font-semibold tabular-nums">{number.format(value)}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Últimas atividades</CardTitle><CardDescription>Visualizações e downloads recentes dos alunos.</CardDescription></CardHeader>
          <CardContent>
            {recentActivities.length === 0 ? <p className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">Ainda não há atividades registradas.</p> : (
              <ul className="divide-y rounded-lg border">
                {recentActivities.map((activity) => <li key={activity.id} className="flex gap-3 p-4"><span className="mt-0.5 rounded-md bg-muted p-2"><ActivityIcon action={activity.action} /></span><div className="min-w-0 flex-1"><p className="text-sm"><span className="font-medium">{activity.fullName}</span> {actionLabel(activity.action)} <span className="font-medium">{activity.materialTitle}</span></p><time className="mt-1 block text-xs text-muted-foreground" dateTime={activity.occurredAt}>{dateTime.format(new Date(activity.occurredAt))}</time></div></li>)}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Materiais mais acessados</CardTitle><CardDescription>Ranking dos últimos 30 dias.</CardDescription></CardHeader>
          <CardContent>
            {topMaterials.length === 0 ? <p className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">Ainda não há acessos a materiais neste período.</p> : (
              <ol className="space-y-3">
                {topMaterials.map((material, index) => <li key={material.materialId} className="flex items-center gap-3 rounded-lg border p-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{material.materialTitle}</p><p className="truncate text-xs text-muted-foreground">{material.courseTitle}</p></div><span className="text-sm font-semibold tabular-nums">{number.format(material.accessCount)}<span className="ml-1 text-xs font-normal text-muted-foreground">acessos</span></span></li>)}
              </ol>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  )
}
