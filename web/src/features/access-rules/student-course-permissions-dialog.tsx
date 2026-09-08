import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import { CoursePermissionToggle } from './course-permission-toggle'
import { coursePermissionRules, type CoursePermission } from './course-permission'
import {
  useAccessRulesQuery,
  useEffectiveAccessQuery,
  useUpsertAccessRuleMutation,
  accessRulesQueryKeys,
} from './access-rules-queries'
import type {
  AccessResource,
  AccessRule,
  EffectiveAccess,
} from './access-rules-types'
import {
  useDeleteStudentCourseAssociationMutation,
  useStudentCourseAssociationsQuery,
  useUpdateStudentCourseAssociationMutation,
} from './student-course-associations-queries'
import type { StudentCourseAssociation } from './student-course-associations-types'

interface StudentCoursePermissionsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  student: { id: number; fullName: string }
}

function permissionFromEffects(view: boolean, download: boolean): CoursePermission {
  if (!view) return 'NONE'
  return download ? 'FULL' : 'READ'
}

function directPermission(rules: AccessRule[]): CoursePermission | null {
  const view = rules.find((rule) => rule.capability === 'VIEW')
  const download = rules.find((rule) => rule.capability === 'DOWNLOAD')

  if (!view || !download) return null

  if (view.effect === 'DENY' && download.effect === 'DENY') return 'NONE'
  if (view.effect === 'ALLOW' && download.effect === 'DENY') return 'READ'
  if (view.effect === 'ALLOW' && download.effect === 'ALLOW') return 'FULL'

  return null
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
}: {
  resource: AccessResource
  studentId: number
}) {
  const target = { userId: studentId, resource }
  const directRules = useAccessRulesQuery(target)
  const effectiveAccess = useEffectiveAccessQuery(target)
  const upsert = useUpsertAccessRuleMutation()
  const queryClient = useQueryClient()
  const [saveError, setSaveError] = useState<string | null>(null)

  const direct = directPermission(directRules.data ?? [])
  const inherited = effectiveAccess.data
    ? permissionFromEffects(
        effectiveAccess.data.view.allowed,
        effectiveAccess.data.download.allowed,
      )
    : 'NONE'
  const value = direct ?? inherited
  const isLoading = directRules.isPending || effectiveAccess.isPending

  async function changePermission(permission: CoursePermission) {
    setSaveError(null)
    const rules = coursePermissionRules(permission)

    try {
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
        disabled={isLoading || upsert.isPending}
        label={`Permissão para ${resource.type.toLowerCase()} ${resource.id}`}
        name={`permission-${studentId}-${resource.type}-${resource.id}`}
        onChange={(permission) => void changePermission(permission)}
        value={value}
      />
      <p className="text-xs text-muted-foreground">
        {direct ? 'Exceção direta neste item.' : inheritedLabel(effectiveAccess.data)}
      </p>
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
}: {
  association: StudentCourseAssociation
  studentId: number
}) {
  const update = useUpdateStudentCourseAssociationMutation()
  const [saveError, setSaveError] = useState<string | null>(null)

  async function changePermission(permission: CoursePermission) {
    setSaveError(null)

    try {
      await update.mutateAsync({
        userId: studentId,
        courseId: association.id,
        permission,
      })
    } catch {
      setSaveError('Não foi possível salvar a permissão do curso. Tente novamente.')
    }
  }

  return (
    <div className="space-y-2">
      <CoursePermissionToggle
        disabled={update.isPending}
        label={`Permissão para o curso ${association.title}`}
        name={`permission-${studentId}-COURSE-${association.id}`}
        onChange={(permission) => void changePermission(permission)}
        value={association.permission}
      />
      <p className="text-xs text-muted-foreground">Regra do curso.</p>
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
}: {
  material: Material
  studentId: number
}) {
  return (
    <li className="flex flex-col gap-3 border-t py-3 pl-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium">Material: {material.title}</p>
        <p className="text-xs text-muted-foreground">{material.originalFilename}</p>
      </div>
      <ResourcePermissionControl
        resource={{ type: 'MATERIAL', id: material.id }}
        studentId={studentId}
      />
    </li>
  )
}

function ModulePermissionRow({
  module,
  studentId,
}: {
  module: CourseModule
  studentId: number
}) {
  const materials = useMaterialsQuery(module.id)

  return (
    <li className="rounded-md border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">Módulo: {module.title}</p>
          {module.description ? (
            <p className="text-sm text-muted-foreground">{module.description}</p>
          ) : null}
        </div>
        <ResourcePermissionControl
          resource={{ type: 'MODULE', id: module.id }}
          studentId={studentId}
        />
      </div>
      {materials.isPending ? (
        <p className="mt-3 text-sm text-muted-foreground">Carregando materiais…</p>
      ) : null}
      {materials.isError ? (
        <p className="mt-3 text-sm text-destructive">Não foi possível carregar os materiais.</p>
      ) : null}
      {materials.data && materials.data.length > 0 ? (
        <ul className="mt-3 rounded-md border px-3">
          {materials.data.map((material) => (
            <MaterialPermissionRow
              key={material.id}
              material={material}
              studentId={studentId}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

function CoursePermissionTree({
  association,
  studentId,
}: {
  association: StudentCourseAssociation
  studentId: number
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">Curso: {association.title}</p>
          <p className="text-sm text-muted-foreground">
            A regra do curso é o padrão para os itens abaixo sem exceção direta.
          </p>
        </div>
        <CourseAssociationPermissionControl association={association} studentId={studentId} />
      </div>
      {course.data.modules.length === 0 ? (
        <p className="text-sm text-muted-foreground">Este curso ainda não possui módulos.</p>
      ) : (
        <ul className="space-y-3">
          {course.data.modules.map((module) => (
            <ModulePermissionRow key={module.id} module={module} studentId={studentId} />
          ))}
        </ul>
      )}
    </div>
  )
}

export function StudentCoursePermissionsDialog({
  open,
  onOpenChange,
  student,
}: StudentCoursePermissionsDialogProps) {
  const associations = useStudentCourseAssociationsQuery(student.id)
  const courses = useCoursesQuery()
  const updateAssociation = useUpdateStudentCourseAssociationMutation()
  const deleteAssociation = useDeleteStudentCourseAssociationMutation()
  const [selectionOpen, setSelectionOpen] = useState(false)
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null)
  const [newPermission, setNewPermission] = useState<CoursePermission>('READ')
  const [configuredCourseId, setConfiguredCourseId] = useState<number | null>(null)
  const [courseToRemove, setCourseToRemove] = useState<StudentCourseAssociation | null>(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  const assigned = associations.data ?? []
  const availableCourses = useMemo(() => {
    const assignedIds = new Set((associations.data ?? []).map((course) => course.id))
    const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR')

    return (courses.data ?? []).filter(
      (course) =>
        !assignedIds.has(course.id) &&
        course.title.toLocaleLowerCase('pt-BR').includes(normalizedSearch),
    )
  }, [associations.data, courses.data, search])

  async function addCourse() {
    if (!selectedCourseId) return
    setError(null)

    try {
      await updateAssociation.mutateAsync({
        userId: student.id,
        courseId: selectedCourseId,
        permission: newPermission,
      })
      setSelectionOpen(false)
      setSelectedCourseId(null)
      setSearch('')
    } catch {
      setError('Não foi possível atribuir o curso. Tente novamente.')
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
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-5xl overflow-y-auto">
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
              disabled={!selectedCourseId || updateAssociation.isPending}
              onClick={() => void addCourse()}
              type="button"
            >
              {updateAssociation.isPending ? 'Adicionando…' : 'Adicionar curso'}
            </Button>
          </section>
        ) : (
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-medium">Cursos atribuídos</h3>
                <p className="text-sm text-muted-foreground">
                  Configure exceções apenas quando o aluno precisar fugir da regra do curso.
                </p>
              </div>
              <Button onClick={() => setSelectionOpen(true)} type="button">
                Adicionar curso
              </Button>
            </div>
            {associations.isPending ? (
              <p className="text-sm text-muted-foreground">Carregando cursos atribuídos…</p>
            ) : null}
            {associations.isError ? (
              <Alert variant="destructive">
                <AlertDescription>Não foi possível carregar os cursos atribuídos.</AlertDescription>
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
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h4 className="font-medium">{course.title}</h4>
                      <p className="text-sm text-muted-foreground">
                        Permissão do curso: {course.permission === 'NONE' ? 'Sem acesso' : course.permission === 'READ' ? 'Leitura' : 'Total'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        aria-label={`Configurar ${course.title}`}
                        onClick={() => setConfiguredCourseId((current) => current === course.id ? null : course.id)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        {configuredCourseId === course.id ? 'Ocultar configuração' : 'Configurar'}
                      </Button>
                      <Button
                        aria-label={`Remover curso ${course.title}`}
                        onClick={() => setCourseToRemove(course)}
                        size="sm"
                        type="button"
                        variant="destructive"
                      >
                        Remover curso
                      </Button>
                    </div>
                  </div>
                  {configuredCourseId === course.id ? (
                    <div className="mt-4">
                      <CoursePermissionTree association={course} studentId={student.id} />
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
