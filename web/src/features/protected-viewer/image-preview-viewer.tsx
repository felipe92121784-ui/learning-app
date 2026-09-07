import { Maximize2, Minus, Plus, RotateCcw } from 'lucide-react'
import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { Button } from '@/components/ui/button'
import type { ProtectedDerivative } from './protected-viewer-types'

const MANUAL_MIN_SCALE = 0.1
const MAX_SCALE = 4
const SCALE_STEP = 0.25
const PAN_STEP = 50

interface Transform {
  scale: number
  x: number
  y: number
}

interface DragOrigin {
  pointerId: number
  pointerX: number
  pointerY: number
  transformX: number
  transformY: number
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

export function ImagePreviewViewer({ derivative }: { derivative: ProtectedDerivative }) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const dragOriginRef = useRef<DragOrigin | null>(null)
  const viewModeRef = useRef<'manual' | 'fit'>('manual')
  const instructionsId = useId()
  const [transform, setTransform] = useState<Transform>({ scale: 1, x: 0, y: 0 })
  const [scaleFloor, setScaleFloor] = useState(MANUAL_MIN_SCALE)
  const [imageState, setImageState] = useState<'loading' | 'loaded' | 'error'>('loading')

  const boundPosition = useCallback(
    (scale: number, x: number, y: number, viewport = viewportRef.current) => {
      const viewportWidth = viewport?.clientWidth ?? 0
      const viewportHeight = viewport?.clientHeight ?? 0
      const maximumX = Math.max(0, (derivative.width * scale - viewportWidth) / 2)
      const maximumY = Math.max(0, (derivative.height * scale - viewportHeight) / 2)
      return {
        x: clamp(x, -maximumX, maximumX),
        y: clamp(y, -maximumY, maximumY),
      }
    },
    [derivative.height, derivative.width],
  )

  const scaleToFit = useCallback(
    (viewport = viewportRef.current) => {
      if (!viewport?.clientWidth || !viewport.clientHeight) return 1
      const scale = Math.min(
        viewport.clientWidth / derivative.width,
        viewport.clientHeight / derivative.height,
      )
      return Number.isFinite(scale) && scale > 0 ? Math.min(scale, MAX_SCALE) : 1
    },
    [derivative.height, derivative.width],
  )

  const minimumScale = useCallback(
    () => Math.min(MANUAL_MIN_SCALE, scaleToFit()),
    [scaleToFit],
  )

  const changeScale = useCallback((delta: number) => {
    viewModeRef.current = 'manual'
    const floor = minimumScale()
    setScaleFloor(floor)
    setTransform((current) => {
      const scale = clamp(current.scale + delta, floor, MAX_SCALE)
      return { scale, ...boundPosition(scale, current.x, current.y) }
    })
  }, [boundPosition, minimumScale])

  function fitToViewport() {
    viewModeRef.current = 'fit'
    const scale = scaleToFit()
    setScaleFloor(Math.min(MANUAL_MIN_SCALE, scale))
    setTransform({ scale, x: 0, y: 0 })
  }

  function resetView() {
    viewModeRef.current = 'manual'
    setTransform({ scale: 1, x: 0, y: 0 })
  }

  const moveImage = useCallback((deltaX: number, deltaY: number) => {
    viewModeRef.current = 'manual'
    setTransform((current) => ({
      scale: current.scale,
      ...boundPosition(current.scale, current.x + deltaX, current.y + deltaY),
    }))
  }, [boundPosition])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    function handleWheel(event: WheelEvent) {
      if (event.deltaY === 0) return
      event.preventDefault()
      changeScale(event.deltaY < 0 ? SCALE_STEP : -SCALE_STEP)
    }

    viewport.addEventListener('wheel', handleWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', handleWheel)
  }, [changeScale])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => {
      dragOriginRef.current = null
      const fitScale = scaleToFit(viewport)
      setScaleFloor(Math.min(MANUAL_MIN_SCALE, fitScale))
      setTransform((current) => {
        if (viewModeRef.current === 'fit') {
          return { scale: fitScale, x: 0, y: 0 }
        }
        return {
          scale: current.scale,
          ...boundPosition(current.scale, current.x, current.y, viewport),
        }
      })
    })
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [boundPosition, scaleToFit])

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    viewModeRef.current = 'manual'
    dragOriginRef.current = {
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      transformX: transform.x,
      transformY: transform.y,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const origin = dragOriginRef.current
    if (!origin || origin.pointerId !== event.pointerId) return
    const position = boundPosition(
      transform.scale,
      origin.transformX + event.clientX - origin.pointerX,
      origin.transformY + event.clientY - origin.pointerY,
    )
    setTransform({ scale: transform.scale, ...position })
  }

  function stopDragging(event: PointerEvent<HTMLDivElement>) {
    if (dragOriginRef.current?.pointerId !== event.pointerId) return
    dragOriginRef.current = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === '+' || event.key === '=') changeScale(SCALE_STEP)
    else if (event.key === '-') changeScale(-SCALE_STEP)
    else if (event.key === '0') resetView()
    else if (event.key.toLocaleLowerCase('pt-BR') === 'f') fitToViewport()
    else if (event.key === 'ArrowLeft') moveImage(-PAN_STEP, 0)
    else if (event.key === 'ArrowRight') moveImage(PAN_STEP, 0)
    else if (event.key === 'ArrowUp') moveImage(0, -PAN_STEP)
    else if (event.key === 'ArrowDown') moveImage(0, PAN_STEP)
    else return
    event.preventDefault()
  }

  return (
    <section aria-label="Controles da imagem protegida" className="space-y-3">
      <div role="toolbar" aria-label="Zoom e posição da imagem" className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Diminuir zoom"
          disabled={transform.scale <= scaleFloor}
          onClick={() => changeScale(-SCALE_STEP)}
        >
          <Minus aria-hidden="true" />
        </Button>
        <output
          aria-live="polite"
          aria-label="Nível de zoom"
          className="inline-flex min-w-16 items-center justify-center text-sm tabular-nums"
        >
          {Math.round(transform.scale * 100)}%
        </output>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Aumentar zoom"
          disabled={transform.scale >= MAX_SCALE}
          onClick={() => changeScale(SCALE_STEP)}
        >
          <Plus aria-hidden="true" />
        </Button>
        <Button type="button" variant="outline" onClick={fitToViewport}>
          <Maximize2 aria-hidden="true" />
          Ajustar à tela
        </Button>
        <Button type="button" variant="outline" onClick={resetView}>
          <RotateCcw aria-hidden="true" />
          Redefinir visualização
        </Button>
      </div>

      <p id={instructionsId} className="sr-only">
        Use as setas para mover a imagem, mais e menos para alterar o zoom, F para ajustar à tela e
        zero para redefinir a visualização.
      </p>

      <div
        ref={viewportRef}
        role="region"
        aria-label="Visualização da imagem protegida"
        aria-describedby={instructionsId}
        aria-keyshortcuts="+ - 0 F ArrowUp ArrowDown ArrowLeft ArrowRight"
        tabIndex={0}
        className="relative h-[70vh] max-h-[48rem] min-h-80 w-full min-w-0 touch-none overflow-hidden rounded-lg border bg-muted/30 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onKeyDown={handleKeyDown}
      >
        {imageState === 'loading' ? (
          <div
            role="status"
            className="absolute inset-0 grid place-items-center text-sm text-muted-foreground"
          >
            Carregando imagem protegida…
          </div>
        ) : null}
        {imageState === 'error' ? (
          <div
            role="alert"
            className="absolute inset-0 z-10 grid place-items-center p-6 text-center text-sm text-destructive"
          >
            Não foi possível carregar a imagem protegida.
          </div>
        ) : null}
        <div
          data-testid="protected-image-pan"
          className="pointer-events-none absolute left-1/2 top-1/2 h-0 w-0"
          style={{ transform: `translate(${transform.x}px, ${transform.y}px)` }}
        >
          <div
            className="absolute left-0 top-0 max-h-none max-w-none"
            style={{
              width: derivative.width,
              height: derivative.height,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <img
              data-testid="protected-image-canvas"
              src={derivative.contentUrl}
              alt="Pré-visualização protegida"
              width={derivative.width}
              height={derivative.height}
              draggable={false}
              className={`block h-full w-full max-h-none max-w-none select-none transition-opacity ${imageState === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
              style={{ transform: `scale(${transform.scale})`, transformOrigin: 'center' }}
              onLoad={() => setImageState('loaded')}
              onError={() => setImageState('error')}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
