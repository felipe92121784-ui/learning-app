import { useMemo, useState } from 'react'
import type { ProtectedDerivative } from './protected-viewer-types'

type PageState = 'loading' | 'loaded' | 'error'

export function PdfPagesViewer({ derivatives }: { derivatives: ProtectedDerivative[] }) {
  const pages = useMemo(
    () =>
      [...derivatives].sort(
        (left, right) =>
          left.position - right.position ||
          (left.pageNumber ?? Number.MAX_SAFE_INTEGER) -
            (right.pageNumber ?? Number.MAX_SAFE_INTEGER) ||
          left.id - right.id,
      ),
    [derivatives],
  )
  const [pageStates, setPageStates] = useState<Record<number, PageState>>({})

  function setPageState(id: number, state: PageState) {
    setPageStates((current) => ({ ...current, [id]: state }))
  }

  return (
    <section aria-label="Páginas do PDF protegido" className="space-y-6">
      {pages.map((derivative, index) => {
        const label = `Página ${derivative.pageNumber ?? index + 1}`
        const state = pageStates[derivative.id] ?? 'loading'

        return (
          <figure
            key={derivative.id}
            className="relative mx-auto overflow-hidden rounded-lg border bg-muted/30 shadow-sm"
            style={{ aspectRatio: `${derivative.width} / ${derivative.height}` }}
          >
            {state === 'loading' ? (
              <div
                role="status"
                className="absolute inset-0 grid place-items-center text-sm text-muted-foreground"
              >
                Carregando {label.toLocaleLowerCase('pt-BR')}…
              </div>
            ) : null}
            {state === 'error' ? (
              <div
                role="alert"
                className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-destructive"
              >
                Não foi possível carregar a {label.toLocaleLowerCase('pt-BR')}.
              </div>
            ) : null}
            <img
              src={derivative.contentUrl}
              alt={label}
              width={derivative.width}
              height={derivative.height}
              loading={index === 0 ? 'eager' : 'lazy'}
              className={`block h-auto w-full select-none ${state === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setPageState(derivative.id, 'loaded')}
              onError={() => setPageState(derivative.id, 'error')}
            />
          </figure>
        )
      })}
    </section>
  )
}
