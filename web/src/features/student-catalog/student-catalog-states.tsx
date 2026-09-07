import { CircleAlert } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function StudentCatalogLoading() {
  return (
    <div aria-live="polite" role="status">
      <span className="sr-only">Carregando cursos…</span>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Card aria-hidden="true" key={index}>
            <CardHeader>
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-full" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-9 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

export function StudentCatalogError() {
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden="true" />
      <AlertDescription>
        Não foi possível carregar seus cursos. Tente novamente.
      </AlertDescription>
    </Alert>
  )
}

export function StudentCatalogEmpty() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Nenhum curso disponível</CardTitle>
        <CardDescription>
          Quando um curso for liberado para você, ele aparecerá aqui.
        </CardDescription>
      </CardHeader>
    </Card>
  )
}

export function StudentCourseLoading() {
  return (
    <div aria-live="polite" className="space-y-6" role="status">
      <span className="sr-only">Carregando curso…</span>
      <Skeleton className="h-4 w-48" />
      <div className="space-y-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <Card aria-hidden="true">
        <CardContent className="space-y-4 py-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    </div>
  )
}

export function StudentCatalogNotFound() {
  return (
    <main>
      <Alert variant="destructive">
        <CircleAlert aria-hidden="true" />
        <AlertDescription>
          Não foi possível encontrar este conteúdo.
        </AlertDescription>
      </Alert>
    </main>
  )
}
