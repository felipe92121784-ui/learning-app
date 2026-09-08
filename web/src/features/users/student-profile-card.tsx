import type { ManagedUser } from './users-types'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { formatEnrollmentDate } from './enrollment-period'

export function StudentProfileCard({ student, courseCount }: { student: ManagedUser; courseCount: number }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <span aria-hidden="true" className="flex size-16 shrink-0 items-center justify-center rounded-full bg-muted text-xl font-semibold">
          {student.initials}
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold break-words">{student.fullName}</h1>
            <Badge variant={student.status === 'ACTIVE' ? 'default' : 'secondary'}>
              {student.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
            </Badge>
          </div>
          <p className="break-all text-sm text-muted-foreground">{student.email}</p>
          <dl className="flex flex-col gap-3 text-sm sm:flex-row sm:gap-6">
            <div><dt className="text-muted-foreground">Cadastrado em</dt><dd>{formatEnrollmentDate(student.createdAt)}</dd></div>
            <div><dt className="text-muted-foreground">Cursos atribuídos</dt><dd>{courseCount} {courseCount === 1 ? 'curso' : 'cursos'}</dd></div>
          </dl>
        </div>
      </CardContent>
    </Card>
  )
}
