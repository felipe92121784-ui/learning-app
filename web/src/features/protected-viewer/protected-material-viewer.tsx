import { Download, LoaderCircle, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { ImagePreviewViewer } from './image-preview-viewer'
import { PdfPagesViewer } from './pdf-pages-viewer'
import { TiledImageViewer } from './tiled-image-viewer'
import {
  useOriginalDownloadMutation,
  useProtectedMaterialViewQuery,
} from './protected-viewer-queries'
import type { ProtectedMaterialView } from './protected-viewer-types'
import { navigateToOriginalDownload } from './original-download-navigation'

type ProtectedMaterialViewerProps =
  | { view: ProtectedMaterialView; materialId?: never }
  | { materialId: number; view?: never }

export function ProtectedMaterialDownloadButton({
  materialId,
  label = 'Baixar original',
}: {
  materialId: number
  label?: string
}) {
  const download = useOriginalDownloadMutation()
  const [failed, setFailed] = useState(false)

  async function handleDownload() {
    setFailed(false)
    try {
      const result = await download.mutateAsync(materialId)
      navigateToOriginalDownload(result.url)
    } catch {
      // Covers authorization and navigation setup without retaining either error/URL.
      setFailed(true)
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        aria-label={label}
        disabled={download.isPending}
        onClick={handleDownload}
      >
        {download.isPending ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          <Download aria-hidden="true" />
        )}
        {download.isPending ? 'Preparando download…' : label}
      </Button>
      {failed ? (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível preparar o download. Tente novamente.
        </p>
      ) : null}
    </div>
  )
}

function LoadedProtectedMaterialViewer({
  view,
  onClose,
}: {
  view: ProtectedMaterialView
  onClose?: () => void
}) {
  return (
    <article
      aria-label={`Material protegido: ${view.title}`}
      className={onClose ? 'flex min-h-0 flex-1 flex-col' : 'space-y-4'}
    >
      <header className={onClose ? 'shrink-0 border-b px-4 py-3 pr-14 sm:px-6 sm:pr-16' : 'flex flex-wrap items-center justify-between gap-3'}>
        <h2 className="text-lg font-semibold">{view.title}</h2>
      </header>

      <div className={onClose ? 'min-h-0 flex-1 overflow-y-auto p-4 sm:p-6' : undefined}>
        {!view.viewer ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Este tipo de material não possui visualização nesta fase.
          </div>
        ) : view.viewer.kind === 'PDF_PAGES' ? (
          <PdfPagesViewer derivatives={view.viewer.derivatives} />
        ) : view.viewer.kind === 'IMAGE_TILES' ? (
          <TiledImageViewer manifestUrl={view.viewer.manifestUrl} />
        ) : (
          <ImagePreviewViewer
            key={view.viewer.derivatives[0].id}
            derivative={view.viewer.derivatives[0]}
          />
        )}
      </div>

      {onClose ? (
        <footer className="flex shrink-0 flex-col-reverse gap-2 border-t p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Button type="button" variant="outline" onClick={onClose}>
            Voltar ao curso
          </Button>
          {view.download.allowed ? (
            <ProtectedMaterialDownloadButton materialId={view.id} />
          ) : null}
        </footer>
      ) : view.download.allowed ? (
        <div className="flex justify-end">
          <ProtectedMaterialDownloadButton materialId={view.id} />
        </div>
      ) : null}
    </article>
  )
}

function QueriedProtectedMaterialViewer({
  materialId,
  onClose,
}: {
  materialId: number
  onClose?: () => void
}) {
  const viewQuery = useProtectedMaterialViewQuery(materialId)

  if (viewQuery.isPending) {
    return (
      <div
        role="status"
        className="rounded-lg border p-8 text-center text-sm text-muted-foreground"
      >
        <LoaderCircle aria-hidden="true" className="mx-auto mb-2 animate-spin" />
        Carregando material protegido…
      </div>
    )
  }

  if (viewQuery.isError || !viewQuery.data) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-destructive/30 p-8 text-center text-sm text-destructive"
      >
        Não foi possível carregar este material.
      </div>
    )
  }

  return <LoadedProtectedMaterialViewer view={viewQuery.data} onClose={onClose} />
}

export function ProtectedMaterialViewer(props: ProtectedMaterialViewerProps) {
  return 'view' in props && props.view ? (
    <LoadedProtectedMaterialViewer view={props.view} />
  ) : (
    <QueriedProtectedMaterialViewer materialId={props.materialId} />
  )
}

export function ProtectedMaterialViewerDialog({
  materialId,
  open,
  onOpenChange,
  title,
}: {
  materialId: number
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="inset-0 flex h-[100dvh] max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 sm:max-w-none"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Visualização de {title}</DialogTitle>
        <Button
          aria-label="Fechar visualização"
          className="absolute right-3 top-3 z-10"
          size="icon"
          type="button"
          variant="ghost"
          onClick={() => onOpenChange(false)}
        >
          <X aria-hidden="true" />
        </Button>
        <QueriedProtectedMaterialViewer
          materialId={materialId}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
