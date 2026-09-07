import OpenSeadragon from 'openseadragon'
import { type PointerEvent, useCallback, useEffect, useRef, useState } from 'react'
import { ImageViewerControls } from './image-viewer-controls'
import type { AbsoluteApiUrl } from './protected-viewer-types'

interface TileManifest {
  width: number
  height: number
  tileSize: number
  minLevel: number
  maxLevel: number
  tileUrlTemplate: AbsoluteApiUrl
}

type ViewerState = 'loading' | 'ready' | 'unavailable'

interface ViewerStateForManifest {
  manifestUrl: AbsoluteApiUrl
  value: ViewerState
}

interface LoupeStateForManifest {
  manifestUrl: AbsoluteApiUrl
  active: boolean
  unavailable: boolean
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isAbsoluteApiUrl(value: unknown): value is AbsoluteApiUrl {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function parseTileManifest(value: unknown): TileManifest | null {
  const candidate = isRecord(value) && isRecord(value.data) ? value.data : value
  if (!isRecord(candidate)) return null
  const { width, height, tileSize, minLevel, maxLevel, tileUrlTemplate } = candidate
  if (
    !isPositiveInteger(width) ||
    !isPositiveInteger(height) ||
    !isPositiveInteger(tileSize) ||
    !isNonNegativeInteger(minLevel) ||
    !isNonNegativeInteger(maxLevel) ||
    minLevel > maxLevel ||
    !isAbsoluteApiUrl(tileUrlTemplate)
  ) {
    return null
  }
  return { width, height, tileSize, minLevel, maxLevel, tileUrlTemplate }
}

function numericCoordinate(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid tile coordinate')
  return String(value)
}

function createTileSource(manifest: TileManifest): OpenSeadragon.TileSource {
  const source = new OpenSeadragon.TileSource({
    width: manifest.width,
    height: manifest.height,
    tileSize: manifest.tileSize,
    minLevel: manifest.minLevel,
    maxLevel: manifest.maxLevel,
  })
  source.getTileUrl = (level, column, row) =>
    manifest.tileUrlTemplate
      .replaceAll('{level}', numericCoordinate(level))
      .replaceAll('{column}', numericCoordinate(column))
      .replaceAll('{row}', numericCoordinate(row))
  return source
}

export function TiledImageViewer({ manifestUrl }: { manifestUrl: AbsoluteApiUrl }) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const loupeCanvasRef = useRef<HTMLCanvasElement>(null)
  const viewerRef = useRef<OpenSeadragon.Viewer | null>(null)
  const [stateForManifest, setStateForManifest] = useState<ViewerStateForManifest>({
    manifestUrl,
    value: 'loading',
  })
  const [loupeStateForManifest, setLoupeStateForManifest] = useState<LoupeStateForManifest>({
    manifestUrl,
    active: false,
    unavailable: false,
  })
  const [loupePosition, setLoupePosition] = useState({ x: 0, y: 0 })
  const state = stateForManifest.manifestUrl === manifestUrl ? stateForManifest.value : 'loading'
  const loupeActive =
    loupeStateForManifest.manifestUrl === manifestUrl && loupeStateForManifest.active
  const loupeUnavailable =
    loupeStateForManifest.manifestUrl === manifestUrl && loupeStateForManifest.unavailable

  const destroyViewer = useCallback(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    viewer.destroy()
    viewerRef.current = null
  }, [])

  useEffect(() => {
    const abortController = new AbortController()
    let active = true
    let viewer: OpenSeadragon.Viewer | null = null
    function setState(value: ViewerState) {
      if (active) setStateForManifest({ manifestUrl, value })
    }

    async function openViewer() {
      try {
        const response = await fetch(manifestUrl, {
          credentials: 'include',
          cache: 'no-store',
          signal: abortController.signal,
        })
        if (!response.ok) throw new Error('Protected manifest unavailable')
        const manifest = parseTileManifest(await response.json())
        const element = viewportRef.current
        if (!active || !manifest || !element) {
          setState('unavailable')
          return
        }

        const source = createTileSource(manifest)
        viewer = OpenSeadragon({
          element,
          tileSources: [source],
          ajaxWithCredentials: true,
          loadTilesWithAjax: true,
          showNavigationControl: false,
          showFullPageControl: false,
          showZoomControl: false,
        })
        viewerRef.current = viewer
        viewer.addHandler('tile-load-failed', (event) => {
          const status = event.tileRequest?.status
          if (!active || (status !== 401 && status !== 403)) return
          if (viewerRef.current === viewer) destroyViewer()
          setState('unavailable')
        })
        setState('ready')
      } catch (error) {
        if (active && !(error instanceof DOMException && error.name === 'AbortError')) {
          setState('unavailable')
        }
      }
    }

    void openViewer()
    return () => {
      active = false
      abortController.abort()
      if (viewerRef.current === viewer) destroyViewer()
    }
  }, [destroyViewer, manifestUrl])

  useEffect(() => {
    if (!loupeActive || loupeUnavailable) return
    let mounted = true
    const viewport = viewportRef.current
    const canvas = loupeCanvasRef.current
    const source = [...(viewport?.querySelectorAll('canvas') ?? [])].find((element) => element !== canvas)
    if (!viewport || !canvas || !source) return
    const context = canvas.getContext('2d')
    if (!context) return
    const rect = source.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const sourceX = clamp((loupePosition.x / rect.width) * source.width, 0, source.width)
    const sourceY = clamp((loupePosition.y / rect.height) * source.height, 0, source.height)
    const sourceWidth = Math.min(source.width, canvas.width / 2)
    const sourceHeight = Math.min(source.height, canvas.height / 2)
    try {
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(
        source,
        clamp(sourceX - sourceWidth / 2, 0, source.width - sourceWidth),
        clamp(sourceY - sourceHeight / 2, 0, source.height - sourceHeight),
        sourceWidth,
        sourceHeight,
        0,
        0,
        canvas.width,
        canvas.height,
      )
    } catch {
      // A tainted OpenSeadragon canvas must not affect the protected viewer lifecycle.
      queueMicrotask(() => {
        if (mounted) setLoupeStateForManifest({ manifestUrl, active: true, unavailable: true })
      })
    }
    return () => { mounted = false }
  }, [loupeActive, loupePosition, loupeUnavailable, manifestUrl])

  function zoom(factor: number) {
    const viewer = viewerRef.current
    if (!viewer) return
    viewer.viewport.zoomBy(factor)
    viewer.viewport.applyConstraints()
  }

  function fit() {
    viewerRef.current?.viewport.goHome()
  }

  function reset() {
    viewerRef.current?.viewport.goHome()
  }

  function fullscreen() {
    const viewer = viewerRef.current
    if (!viewer) return
    viewer.setFullScreen(!viewer.isFullScreen())
  }

  function toggleLoupe() {
    const viewport = viewportRef.current
    setLoupePosition({
      x: (viewport?.clientWidth ?? 0) / 2,
      y: (viewport?.clientHeight ?? 0) / 2,
    })
    setLoupeStateForManifest({ manifestUrl, active: !loupeActive, unavailable: false })
  }

  function moveLoupe(event: PointerEvent<HTMLDivElement>) {
    if (!loupeActive) return
    const rect = event.currentTarget.getBoundingClientRect()
    setLoupePosition({ x: event.clientX - rect.left, y: event.clientY - rect.top })
  }

  return (
    <section aria-label="Controles da imagem protegida" className="space-y-3">
      {state === 'ready' ? (
        <ImageViewerControls
          onZoomIn={() => zoom(1.25)}
          onZoomOut={() => zoom(0.8)}
          onFit={fit}
          onReset={reset}
          onFullscreen={fullscreen}
          onLoupe={toggleLoupe}
          loupeActive={loupeActive}
        />
      ) : null}
      {state !== 'unavailable' ? (
        <div
          ref={viewportRef}
          data-testid="protected-tiled-image-viewport"
          role="region"
          aria-label="Visualização da imagem protegida"
          className="relative h-[70vh] max-h-[48rem] min-h-80 w-full min-w-0 overflow-hidden rounded-lg border bg-muted/30"
          onPointerMove={moveLoupe}
        >
          {state === 'loading' ? (
            <div role="status" className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
              Carregando imagem protegida…
            </div>
          ) : null}
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
              className="pointer-events-none absolute left-1/2 top-1/2 z-10 size-32 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary/80 bg-background/10 shadow-lg backdrop-brightness-125"
              style={{ left: loupePosition.x, top: loupePosition.y }}
            />
          ) : null}
        </div>
      ) : (
        <div role="alert" className="rounded-lg border border-destructive/30 p-8 text-center text-sm text-destructive">
          Não foi possível abrir a imagem protegida.
        </div>
      )}
    </section>
  )
}
