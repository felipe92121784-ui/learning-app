import { useId, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { CoursePermissionToggle } from '@/features/access-rules/course-permission-toggle'
import type { CoursePermission } from '@/features/access-rules/course-permission'
import { useCreateStudentCourseAssociationMutation } from '@/features/access-rules/student-course-associations-queries'
import type { StudentCourseAssociation } from '@/features/access-rules/student-course-associations-types'
import { useCoursesQuery } from '@/features/courses/courses-queries'
import { defaultEnrollmentDates, saoPauloDateRangeToUtc } from './enrollment-period'

interface AddStudentCourseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  studentId: number
  associations: StudentCourseAssociation[]
}

export function AddStudentCourseDialog({ open, ...props }: AddStudentCourseDialogProps) {
  // A fresh form on every opening also refreshes the calendar defaults.
  return <Dialog open={open} onOpenChange={props.onOpenChange}>{open ? <AddStudentCourseForm {...props} /> : null}</Dialog>
}

function AddStudentCourseForm({ onOpenChange, studentId, associations }: Omit<AddStudentCourseDialogProps, 'open'>) {
  const courses = useCoursesQuery()
  const create = useCreateStudentCourseAssociationMutation()
  const inputId = useId()
  const [search, setSearch] = useState('')
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null)
  const [permission, setPermission] = useState<CoursePermission>('READ')
  const [dates, setDates] = useState(() => defaultEnrollmentDates(new Date()))
  const [error, setError] = useState<string | null>(null)
  const available = (courses.data ?? []).filter((course) =>
    !associations.some((association) => association.id === course.id) &&
    course.title.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR')),
  )
  const selectedIsAvailable = available.some((course) => course.id === selectedCourseId)

  async function submit() {
    if (!selectedCourseId || !selectedIsAvailable || create.isPending) return
    setError(null)
    if (!dates.startDate || !dates.endDate) {
      setError('Informe as datas de início e término.')
      return
    }
    if (dates.endDate < dates.startDate) {
      setError('A data de término não pode ser anterior à data de início.')
      return
    }
    let period
    try {
      period = saoPauloDateRangeToUtc(dates.startDate, dates.endDate)
    } catch {
      setError('Informe datas válidas para o período de acesso.')
      return
    }
    try {
      await create.mutateAsync({ userId: studentId, courseId: selectedCourseId, permission, period })
      onOpenChange(false)
    } catch {
      setError('Não foi possível atribuir o curso. Tente novamente.')
    }
  }

  return (
    <DialogContent className="max-h-[calc(100dvh-1rem)] max-w-[calc(100%-1rem)] overflow-y-auto p-4 sm:max-w-xl sm:p-6">
      <DialogHeader><DialogTitle>Adicionar curso</DialogTitle><DialogDescription>Escolha o curso, a permissão e o período de acesso do aluno.</DialogDescription></DialogHeader>
      <form className="space-y-4" noValidate onSubmit={(event) => { event.preventDefault(); void submit() }}>
        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        <Input aria-label="Buscar curso" disabled={create.isPending} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar curso" value={search} />
        <fieldset className="max-h-52 space-y-2 overflow-y-auto" disabled={create.isPending}>
          <legend className="sr-only">Curso disponível</legend>
          {courses.isPending ? <p className="text-sm text-muted-foreground">Carregando cursos…</p> : null}
          {courses.isError ? <Alert variant="destructive"><AlertDescription>Não foi possível carregar os cursos. <Button onClick={() => void courses.refetch()} type="button" variant="outline" size="sm">Tentar novamente</Button></AlertDescription></Alert> : null}
          {!courses.isPending && !courses.isError && available.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum curso disponível.</p> : null}
          {available.map((course) => <label className="flex min-w-0 cursor-pointer items-center gap-3 rounded-md border p-3" key={course.id}><input aria-label={course.title} checked={selectedCourseId === course.id} name={`${inputId}-course`} onChange={() => setSelectedCourseId(course.id)} type="radio" /><span className="min-w-0 break-words">{course.title}</span></label>)}
        </fieldset>
        <div className="space-y-2"><p className="text-sm font-medium">Permissão inicial</p><CoursePermissionToggle disabled={create.isPending} label="Permissão inicial" onChange={setPermission} value={permission} /></div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="min-w-0 space-y-2"><label className="text-sm font-medium" htmlFor={`${inputId}-start`}>Data de início</label><Input disabled={create.isPending} id={`${inputId}-start`} onChange={(event) => setDates({ ...dates, startDate: event.target.value })} required type="date" value={dates.startDate} /></div>
          <div className="min-w-0 space-y-2"><label className="text-sm font-medium" htmlFor={`${inputId}-end`}>Data de término</label><Input disabled={create.isPending} id={`${inputId}-end`} min={dates.startDate} onChange={(event) => setDates({ ...dates, endDate: event.target.value })} required type="date" value={dates.endDate} /></div>
        </div>
        <p className="text-xs text-muted-foreground">Acesso até o fim da data de término, no horário de São Paulo.</p>
        <DialogFooter className="flex-col gap-2 sm:flex-row"><Button disabled={create.isPending} onClick={() => onOpenChange(false)} type="button" variant="outline">Cancelar</Button><Button disabled={!selectedIsAvailable || courses.isError || create.isPending} type="submit">{create.isPending ? 'Adicionando…' : 'Adicionar curso'}</Button></DialogFooter>
      </form>
    </DialogContent>
  )
}
