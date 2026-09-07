import { Link } from '@tanstack/react-router'
import {
  Archive,
  CircleAlert,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  LockKeyhole,
  type LucideIcon,
} from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type {
  StudentCourseDetail,
  StudentMaterial,
  StudentMaterialType,
} from './student-catalog-types'

const materialIcons: Record<StudentMaterialType, LucideIcon> = {
  PDF: FileText,
  IMAGE: ImageIcon,
  ZIP: Archive,
}

function MaterialTypeIcon({ type }: { type: StudentMaterialType }) {
  const Icon = materialIcons[type]
  return (
    <span
      aria-label={`Tipo de material: ${type}`}
      className="rounded-md bg-muted p-2 text-muted-foreground"
      role="img"
    >
      <Icon aria-hidden="true" className="size-4" />
    </span>
  )
}

function MaterialStatus({ material }: { material: StudentMaterial }) {
  if (material.availability === 'LOCKED') {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LockKeyhole aria-hidden="true" className="size-4" />
        <span>Conteúdo bloqueado</span>
        <Badge variant="outline">Bloqueado</Badge>
      </div>
    )
  }

  if (material.availability === 'UNAVAILABLE') {
    const isProcessing = material.unavailableReason === 'PROCESSING'
    const Icon = isProcessing ? LoaderCircle : CircleAlert
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon
          aria-hidden="true"
          className={isProcessing ? 'size-4 animate-spin' : 'size-4'}
        />
        <span>{isProcessing ? 'Processando material' : 'Material indisponível'}</span>
        <Badge variant="outline">Indisponível</Badge>
      </div>
    )
  }

  return <Badge variant="secondary">Disponível</Badge>
}

function MaterialRow({
  courseId,
  material,
}: {
  courseId: number
  material: StudentMaterial
}) {
  return (
    <li
      aria-disabled={material.availability === 'AVAILABLE' ? undefined : true}
      className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-3">
        <MaterialTypeIcon type={material.type} />
        <div className="min-w-0 space-y-1">
          <p className="font-medium">{material.title}</p>
          {material.description ? (
            <p className="text-sm text-muted-foreground">{material.description}</p>
          ) : null}
          <MaterialStatus material={material} />
        </div>
      </div>
      {material.availability === 'AVAILABLE' ? (
        <Button asChild className="shrink-0" size="sm" variant="outline">
          <Link
            aria-label={`Abrir ${material.title}`}
            params={{
              courseId: String(courseId),
              materialId: String(material.id),
            }}
            to="/app/courses/$courseId/materials/$materialId"
          >
            Abrir material
          </Link>
        </Button>
      ) : null}
    </li>
  )
}

export function StudentCourseBreadcrumb({
  course,
}: {
  course: Pick<StudentCourseDetail, 'title'>
}) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-2">
        <li>
          <Link className="hover:text-foreground hover:underline" to="/app">
            Portal
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li aria-current="page" className="text-foreground">
          {course.title}
        </li>
      </ol>
    </nav>
  )
}

export function StudentCourseDetailView({
  course,
}: {
  course: StudentCourseDetail
}) {
  return (
    <main className="space-y-8">
      <StudentCourseBreadcrumb course={course} />

      <header>
        <p className="text-sm font-medium text-muted-foreground">Curso</p>
        <h1 className="mt-2 text-3xl font-semibold">{course.title}</h1>
        {course.description ? (
          <p className="mt-3 max-w-3xl text-muted-foreground">{course.description}</p>
        ) : null}
      </header>

      {course.modules.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Este curso ainda não possui módulos.
          </CardContent>
        </Card>
      ) : (
        <Accordion
          className="rounded-xl border px-4"
          defaultValue={course.modules.map((module) => String(module.id))}
          type="multiple"
        >
          {course.modules.map((module) => (
            <AccordionItem key={module.id} value={String(module.id)}>
              <AccordionTrigger>
                <span className="flex min-w-0 items-start gap-3">
                  {module.availability === 'LOCKED' ? (
                    <LockKeyhole
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    />
                  ) : null}
                  <span className="min-w-0">
                    <span className="block font-semibold">{module.title}</span>
                    {module.description ? (
                      <span className="mt-1 block font-normal text-muted-foreground">
                        {module.description}
                      </span>
                    ) : null}
                    {module.availability === 'LOCKED' ? (
                      <span className="mt-1 block font-normal text-muted-foreground">
                        Módulo bloqueado
                      </span>
                    ) : null}
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                {module.materials.length === 0 ? (
                  <p className="rounded-lg bg-muted/50 p-4 text-muted-foreground">
                    Nenhum material neste módulo.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {module.materials.map((material) => (
                      <MaterialRow
                        courseId={course.id}
                        key={material.id}
                        material={material}
                      />
                    ))}
                  </ul>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </main>
  )
}
