import { Download, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
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

function DownloadOriginalButton({ materialId }: { materialId: number }) {
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
        aria-label="Baixar original"
        disabled={download.isPending}
        onClick={handleDownload}
      >
        {download.isPending ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          <Download aria-hidden="true" />
        )}
        {download.isPending ? 'Preparando download…' : 'Baixar original'}
      </Button>
      {failed ? (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível preparar o download. Tente novamente.
        </p>
      ) : null}
    </div>
  )
}

function LoadedProtectedMaterialViewer({ view }: { view: ProtectedMaterialView }) {
  return (
    <article aria-label={`Material protegido: ${view.title}`} className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{view.title}</h2>
        {view.download.allowed ? <DownloadOriginalButton materialId={view.id} /> : null}
      </header>

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
    </article>
  )
}

function QueriedProtectedMaterialViewer({ materialId }: { materialId: number }) {
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

  return <LoadedProtectedMaterialViewer view={viewQuery.data} />
}

export function ProtectedMaterialViewer(props: ProtectedMaterialViewerProps) {
  return 'view' in props && props.view ? (
    <LoadedProtectedMaterialViewer view={props.view} />
  ) : (
    <QueriedProtectedMaterialViewer materialId={props.materialId} />
  )
}
