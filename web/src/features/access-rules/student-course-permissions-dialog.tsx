import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/lib/api-client'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  useCourseQuery,
  useCoursesQuery,
} from '@/features/courses/courses-queries'
import type { CourseModule } from '@/features/courses/courses-types'
import { useMaterialsQuery } from '@/features/materials/materials-queries'
import type { Material } from '@/features/materials/materials-types'
import { defaultEnrollmentDates, formatEnrollmentDate, saoPauloDateRangeToUtc, type EnrollmentPeriodInput } from '@/features/users/enrollment-period'
import { CoursePermissionToggle } from './course-permission-toggle'
import { coursePermissionRules, type CoursePermission } from './course-permission'
import {
  useAccessRulesQuery,
  useEffectiveAccessQuery,
  useUpsertAccessRuleMutation,
  accessRulesQueryKeys,
} from './access-rules-queries'
import type {
  AccessEffect,
  AccessResource,
  AccessRule,
  EffectiveAccess,
} from './access-rules-types'
import {
  useDeleteStudentCourseAssociationMutation,
  useCreateStudentCourseAssociationMutation,
  useStudentCourseAssociationsQuery,
  useUpdateStudentCourseAssociationMutation,
  studentCourseAssociationsQueryOptions,
  studentCourseAssociationsQueryKeys,
} from './student-course-associations-queries'
import type { StudentCourseAssociation } from './student-course-associations-types'

interface StudentCoursePermissionsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  student: { id: number; fullName: string }
  courseId?: number
}

function permissionFromEffects(view: boolean, download: boolean): CoursePermission {
  if (!view) return 'NONE'
  return download ? 'FULL' : 'READ'
}

function directEffects(rules: AccessRule[]): Partial<Record<'VIEW' | 'DOWNLOAD', AccessEffect>> {
  const now = Date.now()
  return Object.fromEntries(
    rules
      .filter((rule) =>
        (!rule.startsAt || Date.parse(rule.startsAt) <= now) &&
        (!rule.expiresAt || now < Date.parse(rule.expiresAt)),
      )
      .map((rule) => [rule.capability, rule.effect]),
  ) as Partial<Record<'VIEW' | 'DOWNLOAD', AccessEffect>>
}

function isDirectOverride(effect: AccessEffect | undefined) {
  return effect !== undefined && effect !== 'INHERIT'
}

function permissionFromDirectAndEffective(
  direct: Partial<Record<'VIEW' | 'DOWNLOAD', AccessEffect>>,
  effective: EffectiveAccess,
  downloadOnly = false,
): CoursePermission {
  const view = isDirectOverride(direct.VIEW)
    ? direct.VIEW === 'ALLOW'
    : effective.view.allowed
  const download = isDirectOverride(direct.DOWNLOAD)
    ? direct.DOWNLOAD === 'ALLOW'
    : effective.download.allowed

  return downloadOnly ? (view || download ? 'FULL' : 'NONE') : permissionFromEffects(view, download)
}

function inheritedLabel(access: EffectiveAccess | null | undefined): string {
  const source = access?.view.source
  if (source === 'COURSE') return 'Herdado do curso'
  if (source === 'MODULE') return 'Herdado do módulo'
  if (source === 'MATERIAL') return 'Herdado do material'
  return 'Aplicando o padrão da plataforma'
}

function ResourcePermissionControl({
  resource,
  studentId,
  courseId,
  materialType,
  onAssociationMissing,
}: {
  resource: AccessResource
  studentId: number
  courseId: number
  materialType?: Material['type']
  onAssociationMissing: () => void | Promise<void>
}) {
  const target = { userId: studentId, resource }
  const directRules = useAccessRulesQuery(target)
  const effectiveAccess = useEffectiveAccessQuery(target)
  const associations = useStudentCourseAssociationsQuery(studentId)
  const upsert = useUpsertAccessRuleMutation()
  const queryClient = useQueryClient()
  const [saveError, setSaveError] = useState<string | null>(null)

  const direct = directEffects(directRules.data ?? [])
  const overrideCount = [direct.VIEW, direct.DOWNLOAD].filter(isDirectOverride).length
  const courseIsMissing =
    associations.isSuccess && !associations.data.some((association) => association.id === courseId)
  const hasQueryError = directRules.isError || effectiveAccess.isError
  const isLoading =
    directRules.isPending ||
    effectiveAccess.isPending ||
    associations.isPending ||
    associations.isError ||
    courseIsMissing
  const value =
    !hasQueryError && effectiveAccess.data
      ? permissionFromDirectAndEffective(direct, effectiveAccess.data, materialType === 'ZIP')
      : null

  async function changePermission(permission: CoursePermission) {
    setSaveError(null)
    const rules = coursePermissionRules(permission)

    try {
      const latestAssociations = await queryClient.fetchQuery(
        studentCourseAssociationsQueryOptions(studentId),
      )
      if (!latestAssociations.some((association) => association.id === courseId)) {
        await onAssociationMissing()
        setSaveError('Este curso não está mais atribuído ao aluno.')
        return
      }

      await Promise.all([
        upsert.mutateAsync({
          userId: studentId,
          resourceType: resource.type,
          resourceId: resource.id,
          capability: 'VIEW',
          effect: rules.view,
          startsAt: null,
          expiresAt: null,
        }),
        upsert.mutateAsync({
          userId: studentId,
          resourceType: resource.type,
          resourceId: resource.id,
          capability: 'DOWNLOAD',
          effect: rules.download,
          startsAt: null,
          expiresAt: null,
        }),
      ])
      await queryClient.invalidateQueries({ queryKey: accessRulesQueryKeys.all })
    } catch {
      setSaveError('Não foi possível salvar esta exceção. Tente novamente.')
    }
  }

  return (
    <div className="space-y-2">
      <CoursePermissionToggle
        disabled={isLoading || hasQueryError || upsert.isPending || value === null}
        label={`Permissão para ${resource.type.toLowerCase()} ${resource.id}`}
        name={`permission-${studentId}-${resource.type}-${resource.id}`}
        onChange={(permission) => void changePermission(permission)}
        options={materialType === 'ZIP' ? ['NONE', 'FULL'] : undefined}
        labels={materialType === 'ZIP' ? { FULL: 'Download' } : undefined}
        value={value}
      />
      {hasQueryError ? (
        <p className="text-xs text-destructive">
          Não foi possível carregar as regras de acesso deste item.
        </p>
      ) : associations.isError ? (
        <p className="text-xs text-destructive">
          Não foi possível confirmar o curso atribuído deste aluno.
        </p>
      ) : courseIsMissing ? (
        <p className="text-xs text-destructive">Este curso não está mais atribuído ao aluno.</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {overrideCount > 0
            ? overrideCount === 1
              ? 'Exceção direta parcial neste item.'
              : 'Exceção direta neste item.'
            : materialType === 'ZIP'
              ? `${inheritedLabel(effectiveAccess.data)} — ZIP disponível para download.`
              : inheritedLabel(effectiveAccess.data)}
        </p>
      )}
      {saveError ? (
        <Alert variant="destructive">
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}

function CourseAssociationPermissionControl({
  association,
  studentId,
  onAssociationMissing,
}: {
  association: StudentCourseAssociation
  studentId: number
  onAssociationMissing: () => void | Promise<void>
}) {
  const update = useUpdateStudentCourseAssociationMutation()
  const queryClient = useQueryClient()
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [editingPeriod, setEditingPeriod] = useState(!association.startsAt || !association.expiresAt)
  const [pendingPermission, setPendingPermission] = useState(association.permission)
  const [dates, setDates] = useState(() => {
    const defaults = defaultEnrollmentDates(new Date())
    return {
      startDate: association.startsAt ? formatEnrollmentDate(association.startsAt).split('/').reverse().join('-') : defaults.startDate,
      endDate: association.expiresAt ? formatEnrollmentDate(association.expiresAt).split('/').reverse().join('-') : defaults.endDate,
    }
  })

  async function changePermission(permission: CoursePermission, period?: EnrollmentPeriodInput) {
    setSaveError(null)
    setIsSaving(true)
    setPendingPermission(permission)

    try {
      const latestAssociations = await queryClient.fetchQuery({
        ...studentCourseAssociationsQueryOptions(studentId),
        staleTime: 0,
      })
      const latestAssociation = latestAssociations.find((course) => course.id === association.id)
      if (!latestAssociation) {
        await onAssociationMissing()
        return
      }
      if (!period && (!latestAssociation.startsAt || !latestAssociation.expiresAt)) {
        setEditingPeriod(true)
        setSaveError('Este curso não possui um período de acesso definido. Confirme as datas abaixo para salvar a permissão.')
        return
      }
      await update.mutateAsync({
        userId: studentId,
        courseId: association.id,
        permission,
        period: period ?? { startsAt: latestAssociation.startsAt!, expiresAt: latestAssociation.expiresAt! },
      })
      setEditingPeriod(false)
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        await onAssociationMissing()
        return
      }
      setSaveError('Não foi possível salvar a permissão do curso. Tente novamente.')
    } finally {
      setIsSaving(false)
    }
  }

  function savePeriod() {
    let period: EnrollmentPeriodInput
    try {
      period = saoPauloDateRangeToUtc(dates.startDate, dates.endDate)
    } catch {
      setSaveError('Informe datas válidas; o término deve ser igual ou posterior ao início.')
      return
    }
    void changePermission(pendingPermission, period)
  }

  return (
    <div className="space-y-2">
      <CoursePermissionToggle
        disabled={isSaving || update.isPending}
        label={`Permissão para o curso ${association.title}`}
        name={`permission-${studentId}-COURSE-${association.id}`}
        onChange={(permission) => void changePermission(permission)}
        value={editingPeriod ? pendingPermission : association.permission}
      />
      <p className="text-xs text-muted-foreground">Regra do curso.</p>
      {editingPeriod ? (
        <fieldset className="space-y-3 rounded-md border p-3" disabled={isSaving || update.isPending}>
          <legend className="text-sm font-medium">Definir período da matrícula</legend>
          <p className="text-xs text-muted-foreground">Confirme o período antes de salvar. Para datas ausentes, sugerimos hoje e a mesma data no próximo ano. As exceções de módulos e materiais serão preservadas.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="min-w-0 space-y-1 text-sm">Data de início da matrícula<Input type="date" value={dates.startDate} onChange={(event) => setDates({ ...dates, startDate: event.target.value })} /></label>
            <label className="min-w-0 space-y-1 text-sm">Data de término da matrícula<Input type="date" min={dates.startDate} value={dates.endDate} onChange={(event) => setDates({ ...dates, endDate: event.target.value })} /></label>
          </div>
          <p className="text-xs text-muted-foreground">Acesso até o fim da data de término, no horário de São Paulo.</p>
          <Button type="button" onClick={savePeriod}>Salvar período e permissão</Button>
        </fieldset>
      ) : null}
      {saveError ? (
        <Alert variant="destructive">
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}

function MaterialPermissionRow({
  material,
  studentId,
  courseId,
  onAssociationMissing,
}: {
  material: Material
  studentId: number
  courseId: number
  onAssociationMissing: () => void | Promise<void>
}) {
  return (
    <li className="flex flex-col gap-3 border-t py-3 sm:flex-row sm:items-center sm:justify-between sm:pl-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">Material: {material.title}</p>
        <p className="text-xs text-muted-foreground">{material.originalFilename}</p>
      </div>
      <ResourcePermissionControl
        resource={{ type: 'MATERIAL', id: material.id }}
        studentId={studentId}
        courseId={courseId}
        materialType={material.type}
        onAssociationMissing={onAssociationMissing}
      />
    </li>
  )
}

function ModulePermissionRow({
  module,
  studentId,
  courseId,
  onAssociationMissing,
}: {
  module: CourseModule
  studentId: number
  courseId: number
  onAssociationMissing: () => void | Promise<void>
}) {
  const materials = useMaterialsQuery(module.id)

  return (
    <AccordionItem className="rounded-md border px-4" value={String(module.id)}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <AccordionTrigger className="min-w-0 flex-1 py-4 hover:no-underline">
          <span className="min-w-0">
            <span className="block font-medium">Módulo: {module.title}</span>
            {module.description ? (
              <span className="mt-1 block text-sm font-normal text-muted-foreground">{module.description}</span>
            ) : null}
          </span>
        </AccordionTrigger>
        <div className="pb-4 lg:py-4">
          <ResourcePermissionControl
            resource={{ type: 'MODULE', id: module.id }}
            studentId={studentId}
            courseId={courseId}
            onAssociationMissing={onAssociationMissing}
          />
        </div>
      </div>
      <AccordionContent className="border-t pt-3">
        {materials.isPending ? (
          <p className="text-sm text-muted-foreground">Carregando materiais…</p>
        ) : null}
        {materials.isError ? (
          <p className="text-sm text-destructive">Não foi possível carregar os materiais.</p>
        ) : null}
        {materials.data && materials.data.length > 0 ? (
          <ul className="rounded-md border px-3">
            {materials.data.map((material) => (
              <MaterialPermissionRow
                key={material.id}
                material={material}
                studentId={studentId}
                courseId={courseId}
                onAssociationMissing={onAssociationMissing}
              />
            ))}
          </ul>
        ) : null}
      </AccordionContent>
    </AccordionItem>
  )
}

function CoursePermissionTree({
  association,
  studentId,
  onAssociationMissing,
}: {
  association: StudentCourseAssociation
  studentId: number
  onAssociationMissing: () => void | Promise<void>
}) {
  const course = useCourseQuery(association.id)

  if (course.isPending) {
    return <p className="text-sm text-muted-foreground">Carregando conteúdo do curso…</p>
  }

  if (course.isError || !course.data) {
    return <p className="text-sm text-destructive">Não foi possível carregar a estrutura do curso.</p>
  }

  return (
    <div className="space-y-4 rounded-md border bg-muted/20 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="font-medium">Curso: {association.title}</p>
          <p className="text-sm text-muted-foreground">
            A regra do curso é o padrão para os itens abaixo sem exceção direta.
          </p>
        </div>
        <CourseAssociationPermissionControl
          association={association}
          studentId={studentId}
          onAssociationMissing={onAssociationMissing}
        />
      </div>
      {course.data.modules.length === 0 ? (
        <p className="text-sm text-muted-foreground">Este curso ainda não possui módulos.</p>
      ) : (
        <Accordion className="space-y-3" type="multiple">
          {course.data.modules.map((module) => (
            <ModulePermissionRow
              key={module.id}
              module={module}
              studentId={studentId}
              courseId={association.id}
              onAssociationMissing={onAssociationMissing}
            />
          ))}
        </Accordion>
      )}
    </div>
  )
}

export function StudentCoursePermissionsDialog({
  open,
  onOpenChange,
  student,
  courseId,
}: StudentCoursePermissionsDialogProps) {
  const associations = useStudentCourseAssociationsQuery(student.id)
  const queryClient = useQueryClient()
  const courses = useCoursesQuery()
  const createAssociation = useCreateStudentCourseAssociationMutation()
  const deleteAssociation = useDeleteStudentCourseAssociationMutation()
  const [selectionOpen, setSelectionOpen] = useState(false)
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null)
  const [newPermission, setNewPermission] = useState<CoursePermission>('READ')
  const [configuredCourseId, setConfiguredCourseId] = useState<number | null>(null)
  const [courseToRemove, setCourseToRemove] = useState<StudentCourseAssociation | null>(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [removedCourseIds, setRemovedCourseIds] = useState<Set<number>>(() => new Set())

  const associationsReady = associations.isSuccess
  const assigned = associationsReady
    ? associations.data.filter((course) => !removedCourseIds.has(course.id) && (courseId === undefined || course.id === courseId))
    : []
  const availableCourses = useMemo(() => {
    if (!associationsReady) return []

    const assignedIds = new Set(associations.data.map((course) => course.id))
    const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR')

    return (courses.data ?? []).filter(
      (course) =>
        !assignedIds.has(course.id) &&
        course.title.toLocaleLowerCase('pt-BR').includes(normalizedSearch),
    )
  }, [associations.data, associationsReady, courses.data, search])

  async function addCourse() {
    if (!selectedCourseId || !associationsReady) return
    setError(null)

    try {
      const dates = defaultEnrollmentDates(new Date())
      await createAssociation.mutateAsync({
        userId: student.id,
        courseId: selectedCourseId,
        permission: newPermission,
        period: saoPauloDateRangeToUtc(dates.startDate, dates.endDate),
      })
      setSelectionOpen(false)
      setSelectedCourseId(null)
      setSearch('')
      setRemovedCourseIds((current) => {
        if (!current.has(selectedCourseId)) return current
        const next = new Set(current)
        next.delete(selectedCourseId)
        return next
      })
    } catch (error) {
      setError(error instanceof ApiError && error.status === 409
        ? 'Este curso já foi atribuído ao aluno. A lista foi atualizada.'
        : 'Não foi possível atribuir o curso. Tente novamente.')
    }
  }

  async function removeCourse() {
    if (!courseToRemove) return
    setError(null)

    try {
      await deleteAssociation.mutateAsync({
        userId: student.id,
        courseId: courseToRemove.id,
      })
      setConfiguredCourseId((current) =>
        current === courseToRemove.id ? null : current,
      )
      setCourseToRemove(null)
    } catch {
      setError('Não foi possível remover o curso. Tente novamente.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-1rem)] max-w-[calc(100%-1rem)] overflow-y-auto p-4 sm:max-h-[calc(100vh-3rem)] sm:max-w-6xl sm:p-6">
        <DialogHeader>
          <DialogTitle>Cursos e permissões</DialogTitle>
          <DialogDescription>
            Gerencie os cursos de {student.fullName} e as exceções de acesso por conteúdo.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {selectionOpen ? (
          <section aria-label="Adicionar curso" className="space-y-4 rounded-md border p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-medium">Adicionar curso</h3>
                <p className="text-sm text-muted-foreground">
                  Escolha um curso e a permissão inicial para o aluno.
                </p>
              </div>
              <Button onClick={() => setSelectionOpen(false)} size="sm" type="button" variant="ghost">
                Voltar para cursos atribuídos
              </Button>
            </div>
            <Input
              aria-label="Buscar curso"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar curso"
              value={search}
            />
            <div className="max-h-52 space-y-2 overflow-y-auto">
              {availableCourses.map((course) => (
                <label className="flex cursor-pointer items-center gap-3 rounded-md border p-3" key={course.id}>
                  <input
                    checked={selectedCourseId === course.id}
                    name="course-to-add"
                    onChange={() => setSelectedCourseId(course.id)}
                    type="radio"
                  />
                  <span>
                    <span className="block font-medium">{course.title}</span>
                    {course.description ? (
                      <span className="block text-sm text-muted-foreground">{course.description}</span>
                    ) : null}
                  </span>
                </label>
              ))}
              {!courses.isPending && availableCourses.length === 0 ? (
                <p className="py-3 text-sm text-muted-foreground">Nenhum curso disponível.</p>
              ) : null}
            </div>
            <CoursePermissionToggle
              label="Permissão inicial"
              name="new-course-permission"
              onChange={setNewPermission}
              value={newPermission}
            />
            <Button
              disabled={!associationsReady || !selectedCourseId || createAssociation.isPending}
              onClick={() => void addCourse()}
              type="button"
            >
              {createAssociation.isPending ? 'Adicionando…' : 'Adicionar curso'}
            </Button>
          </section>
        ) : (
          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h3 className="font-medium">Cursos atribuídos</h3>
                <p className="text-sm text-muted-foreground">
                  Configure exceções apenas quando o aluno precisar fugir da regra do curso.
                </p>
              </div>
              {courseId === undefined ? <Button
                className="max-sm:w-full"
                disabled={!associationsReady}
                onClick={() => setSelectionOpen(true)}
                type="button"
              >
                Adicionar curso
              </Button> : null}
            </div>
            {associations.isPending ? (
              <p className="text-sm text-muted-foreground">Carregando cursos atribuídos…</p>
            ) : null}
            {associations.isError ? (
              <Alert variant="destructive">
                <AlertDescription className="flex items-center justify-between gap-3">
                  <span>Não foi possível carregar os cursos atribuídos.</span>
                  <Button onClick={() => void associations.refetch()} size="sm" type="button" variant="outline">
                    Tentar novamente
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
            {!associations.isPending && !associations.isError && assigned.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                Este aluno ainda não possui cursos atribuídos.
              </div>
            ) : null}
            <div className="space-y-3">
              {assigned.map((course) => (
                <article className="rounded-md border p-4" key={course.id}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <h4 className="font-medium">{course.title}</h4>
                      <p className="text-sm text-muted-foreground">
                        Permissão do curso: {course.permission === 'NONE' ? 'Sem acesso' : course.permission === 'READ' ? 'Leitura' : 'Total'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 max-sm:grid max-sm:grid-cols-2">
                      {courseId === undefined ? <Button
                        aria-label={`Configurar ${course.title}`}
                        className="max-sm:w-full"
                        onClick={() => setConfiguredCourseId((current) => current === course.id ? null : course.id)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        {configuredCourseId === course.id ? 'Ocultar configuração' : 'Configurar'}
                      </Button> : null}
                      <Button
                        aria-label={`Remover curso ${course.title}`}
                        className="max-sm:w-full"
                        onClick={() => setCourseToRemove(course)}
                        size="sm"
                        type="button"
                        variant="destructive"
                      >
                        Remover curso
                      </Button>
                    </div>
                  </div>
                  {configuredCourseId === course.id || courseId === course.id ? (
                    <div className="mt-4">
                      <CoursePermissionTree
                        association={course}
                        studentId={student.id}
                        onAssociationMissing={async () => {
                          queryClient.setQueryData<StudentCourseAssociation[]>(
                            studentCourseAssociationsQueryKeys.list(student.id),
                            (current) => current?.filter((association) => association.id !== course.id) ?? [],
                          )
                          setRemovedCourseIds((current) => new Set(current).add(course.id))
                          await queryClient.invalidateQueries({
                            queryKey: studentCourseAssociationsQueryKeys.list(student.id),
                          })
                          setConfiguredCourseId(null)
                          setError('Este curso não está mais atribuído ao aluno.')
                        }}
                      />
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        )}

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>

      <Dialog open={courseToRemove !== null} onOpenChange={(isOpen) => !isOpen && setCourseToRemove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover curso?</DialogTitle>
            <DialogDescription>
              {courseToRemove
                ? `O curso “${courseToRemove.title}” será removido de ${student.fullName}. Todas as regras diretas deste curso, módulos e materiais também serão removidas.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setCourseToRemove(null)} type="button" variant="outline">
              Cancelar
            </Button>
            <Button
              disabled={deleteAssociation.isPending}
              onClick={() => void removeCourse()}
              type="button"
              variant="destructive"
            >
              {deleteAssociation.isPending ? 'Removendo…' : 'Confirmar remoção'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
