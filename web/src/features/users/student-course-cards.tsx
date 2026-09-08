import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { StudentCoursePermissionsDialog } from '@/features/access-rules/student-course-permissions-dialog'
import type { StudentCourseAssociation } from '@/features/access-rules/student-course-associations-types'
import { formatEnrollmentDate } from './enrollment-period'

const statusLabels = { ACTIVE: 'Ativo', SCHEDULED: 'Agendado', EXPIRED: 'Expirado' }
const permissionLabels = { NONE: 'Sem acesso', READ: 'Leitura', FULL: 'Total' }

export function StudentCourseCards({ student, associations }: { student: { id: number; fullName: string }; associations: StudentCourseAssociation[] }) {
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null)

  return (
    <>
      {associations.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">Este aluno ainda não possui cursos atribuídos.</p>
      ) : (
        <ul aria-label="Cursos atribuídos" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {associations.map((association) => (
            <li className="min-w-0" key={association.id}>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle><h3 className="break-words">{association.title}</h3></CardTitle>
                  <Badge variant={association.status === 'ACTIVE' ? 'default' : 'secondary'}>{statusLabels[association.status]}</Badge>
                </CardHeader>
                <CardContent className="flex-1 space-y-3 text-sm">
                  <div><p className="text-muted-foreground">Período de acesso (datas inclusivas)</p><p>{association.startsAt && association.expiresAt
                    ? `${formatEnrollmentDate(association.startsAt)} a ${formatEnrollmentDate(association.expiresAt)}`
                    : 'Período não definido'}</p></div>
                  <div><p className="text-muted-foreground">Permissão do curso</p><p>{permissionLabels[association.permission]}</p></div>
                </CardContent>
                <CardFooter>
                  <Button aria-label={`Gerenciar permissões de ${association.title}`} className="w-full sm:w-auto" onClick={() => setSelectedCourseId(association.id)} type="button" variant="outline">Gerenciar permissões</Button>
                </CardFooter>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {selectedCourseId !== null ? (
        <StudentCoursePermissionsDialog key={`${student.id}-${selectedCourseId}`} open onOpenChange={(open) => { if (!open) setSelectedCourseId(null) }} student={student} courseId={selectedCourseId} />
      ) : null}
    </>
  )
}
