// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const viewer = vi.hoisted(() => ({
  addHandler: vi.fn(),
  destroy: vi.fn(),
  setFullScreen: vi.fn(),
  viewport: {
    applyConstraints: vi.fn(),
    goHome: vi.fn(),
    zoomBy: vi.fn(),
  },
}))
const tileSource = vi.hoisted(() => vi.fn(function TileSource(this: object, options: object) {
  Object.assign(this, options)
}))
const openSeadragon = vi.hoisted(() => vi.fn(() => viewer))

vi.mock('openseadragon', () => ({ default: Object.assign(openSeadragon, { TileSource: tileSource }) }))

import { TiledImageViewer } from './tiled-image-viewer'

const manifestUrl = 'https://api.example.test/api/v1/materials/14/tiles/manifest'
const manifest = {
  width: 6400,
  height: 4800,
  tileSize: 256,
  minLevel: 0,
  maxLevel: 5,
  tileUrlTemplate: 'https://api.example.test/api/v1/materials/14/tiles/{level}/{column}/{row}',
}

describe('TiledImageViewer', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('loads only a safe manifest with session credentials and creates a numeric tile source', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: manifest }))
    vi.stubGlobal('fetch', fetchMock)

    render(<TiledImageViewer manifestUrl={manifestUrl} />)

    expect(screen.getByRole('status').textContent).toContain('Carregando imagem protegida')
    await waitFor(() => expect(openSeadragon).toHaveBeenCalledOnce())

    expect(fetchMock).toHaveBeenCalledWith(manifestUrl, {
      credentials: 'include',
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    })
    const source = tileSource.mock.instances[0] as { getTileUrl: (level: number, x: number, y: number) => string }
    expect(source.getTileUrl(3, 4, 5)).toBe('https://api.example.test/api/v1/materials/14/tiles/3/4/5')
    expect(openSeadragon).toHaveBeenCalledWith(expect.objectContaining({
      ajaxWithCredentials: true,
      loadTilesWithAjax: true,
      tileSources: [source],
    }))
    expect(document.body.textContent).not.toContain(manifestUrl)
    expect(document.body.textContent).not.toContain('storagePrefix')
  })

  it('destroys its one viewer when the manifest changes and when it unmounts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(Response.json({ data: manifest }))))
    const rendered = render(<TiledImageViewer manifestUrl={manifestUrl} />)
    await waitFor(() => expect(openSeadragon).toHaveBeenCalledOnce())

    rendered.rerender(<TiledImageViewer manifestUrl="https://api.example.test/api/v1/materials/15/tiles/manifest" />)
    await waitFor(() => expect(openSeadragon).toHaveBeenCalledTimes(2))
    expect(viewer.destroy).toHaveBeenCalledTimes(1)

    rendered.unmount()
    expect(viewer.destroy).toHaveBeenCalledTimes(2)
  })

  it('rejects invalid and unauthorized manifests without exposing their details', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ data: { ...manifest, maxLevel: 'five' } }))
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
    vi.stubGlobal('fetch', fetchMock)

    const rendered = render(<TiledImageViewer manifestUrl={manifestUrl} />)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Não foi possível abrir a imagem protegida.'))
    expect(openSeadragon).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain(manifestUrl)

    rendered.rerender(<TiledImageViewer manifestUrl="https://api.example.test/api/v1/materials/15/tiles/manifest" />)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Não foi possível abrir a imagem protegida.'))
    expect(openSeadragon).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain('403')
  })

  it('clears the OpenSeadragon instance when a tile read is denied', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ data: manifest })))
    render(<TiledImageViewer manifestUrl={manifestUrl} />)
    await waitFor(() => expect(openSeadragon).toHaveBeenCalledOnce())

    const failureHandler = viewer.addHandler.mock.calls.find(([name]) => name === 'tile-load-failed')?.[1]
    failureHandler({ tileRequest: { status: 401 } })

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Não foi possível abrir a imagem protegida.'))
    expect(viewer.destroy).toHaveBeenCalledOnce()
  })

  it('uses a local canvas loupe without rendering another protected tile URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ data: manifest })))
    render(<TiledImageViewer manifestUrl={manifestUrl} />)
    await waitFor(() => expect(openSeadragon).toHaveBeenCalledOnce())

    fireEvent.click(screen.getByRole('button', { name: 'Alternar lupa' }))

    const loupe = screen.getByTestId('protected-image-loupe')
    expect(loupe.tagName).toBe('CANVAS')
    expect(loupe.getAttribute('src')).toBeNull()
    expect(document.body.textContent).not.toContain(manifest.tileUrlTemplate)
  })

  it('keeps the tiled viewport usable when protected canvas pixels reject a local copy', async () => {
    const context = {
      clearRect: vi.fn(),
      drawImage: vi.fn(() => { throw new DOMException('Cross-origin pixels', 'SecurityError') }),
    } as unknown as CanvasRenderingContext2D
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ data: manifest })))
    render(<TiledImageViewer manifestUrl={manifestUrl} />)
    await waitFor(() => expect(openSeadragon).toHaveBeenCalledOnce())
    const viewport = screen.getByRole('region', { name: 'Visualização da imagem protegida' })
    const protectedCanvas = document.createElement('canvas')
    vi.spyOn(protectedCanvas, 'getBoundingClientRect').mockReturnValue({ width: 100, height: 100 } as DOMRect)
    viewport.append(protectedCanvas)

    fireEvent.click(screen.getByRole('button', { name: 'Alternar lupa' }))

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('A lupa não está disponível para esta imagem.'))
    expect(screen.getByRole('region', { name: 'Visualização da imagem protegida' })).toBeTruthy()
    expect(viewer.destroy).not.toHaveBeenCalled()
  })
})
