import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { ImageViewerControls } from './image-viewer-controls'
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

interface PinchOrigin {
  distance: number
  scale: number
}

interface PointerPosition {
  x: number
  y: number
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

export function ImagePreviewViewer({ derivative }: { derivative: ProtectedDerivative }) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const loupeCanvasRef = useRef<HTMLCanvasElement>(null)
  const dragOriginRef = useRef<DragOrigin | null>(null)
  const pointersRef = useRef(new Map<number, PointerPosition>())
  const pinchOriginRef = useRef<PinchOrigin | null>(null)
  const viewModeRef = useRef<'manual' | 'fit'>('manual')
  const instructionsId = useId()
  const [transform, setTransform] = useState<Transform>({ scale: 1, x: 0, y: 0 })
  const [scaleFloor, setScaleFloor] = useState(MANUAL_MIN_SCALE)
  const [imageState, setImageState] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [loupeActive, setLoupeActive] = useState(false)
  const [loupeUnavailable, setLoupeUnavailable] = useState(false)
  const [loupePosition, setLoupePosition] = useState<PointerPosition>({ x: 0, y: 0 })
  const [fullscreenFallback, setFullscreenFallback] = useState(false)

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

  useEffect(() => {
    if (!loupeActive || loupeUnavailable || imageState !== 'loaded') return
    let mounted = true
    const canvas = loupeCanvasRef.current
    const image = imageRef.current
    const viewport = viewportRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !image || !viewport || !context || transform.scale <= 0) return

    const sourceWidth = Math.min(derivative.width, canvas.width / (2 * transform.scale))
    const sourceHeight = Math.min(derivative.height, canvas.height / (2 * transform.scale))
    const imageLeft = viewport.clientWidth / 2 + transform.x - (derivative.width * transform.scale) / 2
    const imageTop = viewport.clientHeight / 2 + transform.y - (derivative.height * transform.scale) / 2
    const sourceX = clamp((loupePosition.x - imageLeft) / transform.scale, 0, derivative.width)
    const sourceY = clamp((loupePosition.y - imageTop) / transform.scale, 0, derivative.height)
    try {
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(
        image,
        clamp(sourceX - sourceWidth / 2, 0, derivative.width - sourceWidth),
        clamp(sourceY - sourceHeight / 2, 0, derivative.height - sourceHeight),
        sourceWidth,
        sourceHeight,
        0,
        0,
        canvas.width,
        canvas.height,
      )
    } catch {
      // Cross-origin image pixels can be displayable but not copyable into another canvas.
      queueMicrotask(() => {
        if (mounted) setLoupeUnavailable(true)
      })
    }
    return () => { mounted = false }
  }, [derivative.height, derivative.width, imageState, loupeActive, loupePosition, loupeUnavailable, transform])

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.pointerType !== 'touch') return
    viewModeRef.current = 'manual'
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointersRef.current.size === 1) {
      dragOriginRef.current = {
        pointerId: event.pointerId,
        pointerX: event.clientX,
        pointerY: event.clientY,
        transformX: transform.x,
        transformY: transform.y,
      }
    } else if (pointersRef.current.size === 2) {
      const [first, second] = [...pointersRef.current.values()]
      if (!first || !second) return
      pinchOriginRef.current = {
        distance: Math.hypot(second.x - first.x, second.y - first.y),
        scale: transform.scale,
      }
      dragOriginRef.current = null
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    }
    if (loupeActive) {
      const rect = event.currentTarget.getBoundingClientRect()
      setLoupePosition({ x: event.clientX - rect.left, y: event.clientY - rect.top })
    }
    const pinch = pinchOriginRef.current
    if (pinch && pointersRef.current.size === 2) {
      const [first, second] = [...pointersRef.current.values()]
      if (!first || !second || pinch.distance <= 0) return
      const floor = minimumScale()
      const distance = Math.hypot(second.x - first.x, second.y - first.y)
      const scale = clamp(pinch.scale * (distance / pinch.distance), floor, MAX_SCALE)
      setScaleFloor(floor)
      setTransform((current) => ({
        scale,
        ...boundPosition(scale, current.x, current.y),
      }))
      return
    }
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
    pointersRef.current.delete(event.pointerId)
    if (dragOriginRef.current?.pointerId === event.pointerId) dragOriginRef.current = null
    if (pointersRef.current.size < 2) pinchOriginRef.current = null
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

  function fullscreen() {
    const viewport = viewportRef.current
    if (!viewport) return
    if (typeof viewport.requestFullscreen !== 'function') {
      setFullscreenFallback((current) => !current)
      return
    }
    void viewport.requestFullscreen().catch(() => setFullscreenFallback(true))
  }

  function toggleLoupe() {
    setLoupeUnavailable(false)
    setLoupeActive((current) => !current)
  }

  return (
    <section aria-label="Controles da imagem protegida" className="space-y-3">
      <ImageViewerControls
        onZoomIn={() => changeScale(SCALE_STEP)}
        onZoomOut={() => changeScale(-SCALE_STEP)}
        onFit={fitToViewport}
        onReset={resetView}
        onFullscreen={fullscreen}
        onLoupe={toggleLoupe}
        loupeActive={loupeActive}
        zoomInDisabled={transform.scale >= MAX_SCALE}
        zoomOutDisabled={transform.scale <= scaleFloor}
      />
      <output
        aria-live="polite"
        aria-label="Nível de zoom"
        className="inline-flex min-w-16 items-center justify-center text-sm tabular-nums"
      >
        {Math.round(transform.scale * 100)}%
      </output>

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
        className={`relative h-[70vh] max-h-[48rem] min-h-80 w-full min-w-0 touch-none overflow-hidden rounded-lg border bg-muted/30 outline-none focus-visible:ring-2 focus-visible:ring-ring ${fullscreenFallback ? 'fixed inset-0 z-50 h-screen max-h-none rounded-none bg-background' : ''}`}
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
              ref={imageRef}
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
        {loupeActive && loupeUnavailable ? (
          <div
            role="status"
            aria-live="polite"
            data-testid="protected-image-loupe-unavailable"
            className="pointer-events-none absolute z-10 grid size-32 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-muted-foreground/50 bg-background/90 p-3 text-center text-xs text-muted-foreground shadow-lg"
            style={{ left: loupePosition.x, top: loupePosition.y }}
          >
            A lupa não está disponível para esta imagem.
          </div>
        ) : loupeActive ? (
          <canvas
            ref={loupeCanvasRef}
            aria-hidden="true"
            data-testid="protected-image-loupe"
            width={128}
            height={128}
            className="pointer-events-none absolute z-10 size-32 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary/80 bg-background/10 shadow-lg backdrop-brightness-125"
            style={{ left: loupePosition.x, top: loupePosition.y }}
          />
        ) : null}
      </div>
    </section>
  )
}
