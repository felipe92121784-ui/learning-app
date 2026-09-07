import { Fullscreen, Maximize2, Minus, Plus, RotateCcw, ScanSearch } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ImageViewerControlsProps {
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  onReset: () => void
  onFullscreen: () => void
  onLoupe: () => void
  loupeActive: boolean
  zoomInDisabled?: boolean
  zoomOutDisabled?: boolean
}

export function ImageViewerControls({
  onZoomIn,
  onZoomOut,
  onFit,
  onReset,
  onFullscreen,
  onLoupe,
  loupeActive,
  zoomInDisabled = false,
  zoomOutDisabled = false,
}: ImageViewerControlsProps) {
  return (
    <div role="toolbar" aria-label="Zoom e posição da imagem" className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Diminuir zoom"
        disabled={zoomOutDisabled}
        onClick={onZoomOut}
      >
        <Minus aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Aumentar zoom"
        disabled={zoomInDisabled}
        onClick={onZoomIn}
      >
        <Plus aria-hidden="true" />
      </Button>
      <Button type="button" variant="outline" onClick={onFit}>
        <Maximize2 aria-hidden="true" />
        Ajustar à tela
      </Button>
      <Button type="button" variant="outline" onClick={onReset}>
        <RotateCcw aria-hidden="true" />
        Redefinir visualização
      </Button>
      <Button type="button" variant="outline" size="icon" aria-label="Tela cheia" onClick={onFullscreen}>
        <Fullscreen aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Alternar lupa"
        aria-pressed={loupeActive}
        onClick={onLoupe}
      >
        <ScanSearch aria-hidden="true" />
      </Button>
    </div>
  )
}
