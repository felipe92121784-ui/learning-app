import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { CourseModule } from './courses-types'

interface ModulesListProps {
  modules: CourseModule[]
  onMove: (moduleIds: number[]) => void
  onEdit: (module: CourseModule) => void
  onDelete: (module: CourseModule) => void
  isLoading?: boolean
  isMutating?: boolean
  error?: string | Error | null
}

function moveModule(modules: CourseModule[], fromIndex: number, toIndex: number) {
  const moved = [...modules]
  const [module] = moved.splice(fromIndex, 1)
  moved.splice(toIndex, 0, module)
  return moved.map(({ id }) => id)
}

function errorMessage(error: string | Error) {
  return typeof error === 'string' ? error : error.message
}

export function ModulesList({
  error,
  isLoading = false,
  isMutating = false,
  modules,
  onDelete,
  onEdit,
  onMove,
}: ModulesListProps) {
  if (isLoading) {
    return <p aria-live="polite">Carregando módulos…</p>
  }

  const orderedModules = [...modules].sort((left, right) => left.position - right.position)

  return (
    <section aria-label="Módulos do curso" className="space-y-3">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}
      {orderedModules.length === 0 ? (
        <p>Nenhum módulo adicionado.</p>
      ) : (
        <ol className="space-y-2">
          {orderedModules.map((module, index) => (
            <li className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between" key={module.id}>
              <div className="min-w-0">
                <p className="font-medium">{module.title}</p>
                {module.description ? <p className="text-sm text-muted-foreground">{module.description}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2 border-t pt-3 sm:shrink-0 sm:border-0 sm:pt-0">
                <div className="flex gap-1">
                  <Button
                    aria-label={`Mover ${module.title} para cima`}
                    disabled={isMutating || index === 0}
                    onClick={() => onMove(moveModule(orderedModules, index, index - 1))}
                    size="icon-sm"
                    type="button"
                    variant="outline"
                  >
                    ↑
                  </Button>
                  <Button
                    aria-label={`Mover ${module.title} para baixo`}
                    disabled={isMutating || index === orderedModules.length - 1}
                    onClick={() => onMove(moveModule(orderedModules, index, index + 1))}
                    size="icon-sm"
                    type="button"
                    variant="outline"
                  >
                    ↓
                  </Button>
                </div>
                <Button
                  aria-label={`Editar ${module.title}`}
                  className="flex-1 sm:flex-none"
                  disabled={isMutating}
                  onClick={() => onEdit(module)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Editar
                </Button>
                <Button
                  aria-label={`Excluir ${module.title}`}
                  className="flex-1 sm:flex-none"
                  disabled={isMutating}
                  onClick={() => onDelete(module)}
                  size="sm"
                  type="button"
                  variant="destructive"
                >
                  Excluir
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
