// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProtectedDerivative } from './protected-viewer-types'
import { ImagePreviewViewer } from './image-preview-viewer'

const derivative: ProtectedDerivative = {
  id: 52,
  pageNumber: null,
  width: 1000,
  height: 800,
  position: 0,
  contentUrl: 'https://api.example.test/api/v1/materials/14/derivatives/52',
}

const maximumSizeDerivative: ProtectedDerivative = {
  ...derivative,
  id: 53,
  width: 2560,
  height: 1600,
  contentUrl: 'https://api.example.test/api/v1/materials/14/derivatives/53',
}

function imageTransform() {
  return screen.getByRole('img', { name: 'Pré-visualização protegida' }).getAttribute('style') ?? ''
}

function panTransform() {
  return screen.getByTestId('protected-image-pan').getAttribute('style') ?? ''
}

function currentScale() {
  const match = imageTransform().match(/scale\(([^)]+)\)/)
  if (!match?.[1]) throw new Error('Image scale is missing')
  return Number(match[1])
}

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = []
  readonly observe = vi.fn()
  readonly disconnect = vi.fn()
  readonly callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    ResizeObserverMock.instances.push(this)
  }

  notify(target: Element) {
    this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver)
  }
}

describe('ImagePreviewViewer', () => {
  afterEach(() => {
    cleanup()
    ResizeObserverMock.instances = []
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('uses a non-passive native wheel listener, cancels vertical scrolling and cleans it up', () => {
    const addEventListener = vi.spyOn(HTMLElement.prototype, 'addEventListener')
    const removeEventListener = vi.spyOn(HTMLElement.prototype, 'removeEventListener')
    const rendered = render(<ImagePreviewViewer derivative={derivative} />)
    const viewport = screen.getByRole('region', { name: 'Visualização da imagem protegida' })

    expect(addEventListener).toHaveBeenCalledWith('wheel', expect.any(Function), { passive: false })
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar zoom' }))
    expect(imageTransform()).toContain('scale(1.25)')

    const verticalWheel = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: -100,
    })
    expect(fireEvent(viewport, verticalWheel)).toBe(false)
    expect(verticalWheel.defaultPrevented).toBe(true)
    expect(imageTransform()).toContain('scale(1.5)')

    const horizontalWheel = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaX: 100,
      deltaY: 0,
    })
    expect(fireEvent(viewport, horizontalWheel)).toBe(true)
    expect(horizontalWheel.defaultPrevented).toBe(false)
    expect(imageTransform()).toContain('scale(1.5)')

    for (let index = 0; index < 20; index += 1) fireEvent.wheel(viewport, { deltaY: -100 })
    expect(imageTransform()).toContain('scale(4)')
    expect(screen.getByRole('button', { name: 'Aumentar zoom' })).toHaveProperty('disabled', true)

    for (let index = 0; index < 30; index += 1) fireEvent.wheel(viewport, { deltaY: 100 })
    expect(imageTransform()).toContain('scale(0.1)')
    expect(screen.getByRole('button', { name: 'Diminuir zoom' })).toHaveProperty('disabled', true)

    const registeredWheel = addEventListener.mock.calls.find(
      ([eventName, , options]) => eventName === 'wheel' && (options as AddEventListenerOptions)?.passive === false,
    )
    rendered.unmount()
    expect(removeEventListener).toHaveBeenCalledWith('wheel', registeredWheel?.[1])
  })

  it('uses a fixed viewport-centered absolute layer, bounds pointer pan, fits and resets', () => {
    render(<ImagePreviewViewer derivative={derivative} />)
    const viewport = screen.getByRole('region', { name: 'Visualização da imagem protegida' })
    const panLayer = screen.getByTestId('protected-image-pan')
    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 500 })
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 400 })

    expect(viewport.className).not.toContain('grid')
    expect(viewport.className).toContain('h-[70vh]')
    expect(panLayer.className).toContain('absolute')
    expect(panLayer.className).toContain('left-1/2')
    expect(panLayer.className).toContain('top-1/2')

    fireEvent.click(screen.getByRole('button', { name: 'Aumentar zoom' }))
    fireEvent.pointerDown(viewport, { pointerId: 1, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 10_000, clientY: -10_000 })
    fireEvent.pointerUp(viewport, { pointerId: 1 })
    expect(panTransform()).toContain('translate(375px, -300px)')

    fireEvent.click(screen.getByRole('button', { name: 'Ajustar à tela' }))
    expect(imageTransform()).toContain('scale(0.5)')
    expect(panTransform()).toContain('translate(0px, 0px)')

    fireEvent.click(screen.getByRole('button', { name: 'Aumentar zoom' }))
    fireEvent.click(screen.getByRole('button', { name: 'Redefinir visualização' }))
    expect(imageTransform()).toContain('scale(1)')
    expect(panTransform()).toContain('translate(0px, 0px)')
  })

  it('recomputes fit and clamps manual pan when the viewport resizes', () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    let viewportWidth = 500
    let viewportHeight = 400
    const rendered = render(<ImagePreviewViewer derivative={derivative} />)
    const viewport = screen.getByRole('region', { name: 'Visualização da imagem protegida' })
    Object.defineProperty(viewport, 'clientWidth', {
      configurable: true,
      get: () => viewportWidth,
    })
    Object.defineProperty(viewport, 'clientHeight', {
      configurable: true,
      get: () => viewportHeight,
    })
    const observer = ResizeObserverMock.instances[0]!
    expect(observer.observe).toHaveBeenCalledWith(viewport)

    fireEvent.click(screen.getByRole('button', { name: 'Ajustar à tela' }))
    expect(imageTransform()).toContain('scale(0.5)')
    viewportWidth = 250
    viewportHeight = 200
    act(() => observer.notify(viewport))
    expect(imageTransform()).toContain('scale(0.25)')
    expect(panTransform()).toContain('translate(0px, 0px)')

    fireEvent.click(screen.getByRole('button', { name: 'Redefinir visualização' }))
    fireEvent.pointerDown(viewport, { pointerId: 2, button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(viewport, { pointerId: 2, clientX: 10_000, clientY: -10_000 })
    fireEvent.pointerUp(viewport, { pointerId: 2 })
    expect(panTransform()).toContain('translate(375px, -300px)')

    viewportWidth = 800
    viewportHeight = 700
    act(() => observer.notify(viewport))
    expect(panTransform()).toContain('translate(100px, -50px)')

    rendered.unmount()
    expect(observer.disconnect).toHaveBeenCalledOnce()
  })

  it('fits the entire maximum-size preview below 10% and preserves fit on narrow resize', () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    let viewportWidth = 238
    let viewportHeight = 200
    render(<ImagePreviewViewer derivative={maximumSizeDerivative} />)
    const viewport = screen.getByRole('region', { name: 'Visualização da imagem protegida' })
    Object.defineProperty(viewport, 'clientWidth', {
      configurable: true,
      get: () => viewportWidth,
    })
    Object.defineProperty(viewport, 'clientHeight', {
      configurable: true,
      get: () => viewportHeight,
    })
    const observer = ResizeObserverMock.instances[0]!

    fireEvent.click(screen.getByRole('button', { name: 'Ajustar à tela' }))
    expect(currentScale()).toBeCloseTo(238 / 2560)
    expect(maximumSizeDerivative.width * currentScale()).toBeLessThanOrEqual(viewportWidth)
    expect(maximumSizeDerivative.height * currentScale()).toBeLessThanOrEqual(viewportHeight)
    expect(panTransform()).toContain('translate(0px, 0px)')
    expect(screen.getByRole('button', { name: 'Diminuir zoom' })).toHaveProperty('disabled', true)

    viewportWidth = 200
    viewportHeight = 125
    act(() => observer.notify(viewport))
    expect(currentScale()).toBeCloseTo(0.078125)
    expect(maximumSizeDerivative.width * currentScale()).toBeLessThanOrEqual(viewportWidth)
    expect(maximumSizeDerivative.height * currentScale()).toBeLessThanOrEqual(viewportHeight)
    expect(panTransform()).toContain('translate(0px, 0px)')
    expect(screen.getByRole('button', { name: 'Diminuir zoom' })).toHaveProperty('disabled', true)
  })

  it('pans with keyboard arrows using the same bounds and exposes shortcut instructions', () => {
    render(<ImagePreviewViewer derivative={derivative} />)
    const viewport = screen.getByRole('region', { name: 'Visualização da imagem protegida' })
    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 500 })
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 400 })

    expect(screen.getByText(/use as setas para mover a imagem/i).className).toContain('sr-only')
    fireEvent.keyDown(viewport, { key: 'ArrowRight' })
    fireEvent.keyDown(viewport, { key: 'ArrowDown' })
    expect(panTransform()).toContain('translate(50px, 50px)')

    for (let index = 0; index < 20; index += 1) {
      fireEvent.keyDown(viewport, { key: 'ArrowRight' })
      fireEvent.keyDown(viewport, { key: 'ArrowDown' })
    }
    expect(panTransform()).toContain('translate(250px, 200px)')

    fireEvent.keyDown(viewport, { key: 'ArrowLeft' })
    fireEvent.keyDown(viewport, { key: 'ArrowUp' })
    expect(panTransform()).toContain('translate(200px, 150px)')
  })

  it('reports protected preview loading and image failure without exposing private storage data', () => {
    render(<ImagePreviewViewer derivative={derivative} />)
    const image = screen.getByRole('img', { name: 'Pré-visualização protegida' })

    expect(screen.getByText('Carregando imagem protegida…')).toBeTruthy()
    fireEvent.error(image)
    expect(screen.getByRole('alert').textContent).toBe('Não foi possível carregar a imagem protegida.')
    expect(document.body.textContent).not.toContain('storageKey')
    expect(image.getAttribute('src')).toBe(derivative.contentUrl)
  })

  it('pinches with two pointers and uses a fullscreen layout fallback when the browser API is unavailable', () => {
    render(<ImagePreviewViewer derivative={derivative} />)
    const viewport = screen.getByRole('region', { name: 'Visualização da imagem protegida' })
    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 500 })
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 400 })
    Object.defineProperty(viewport, 'requestFullscreen', { configurable: true, value: undefined })

    fireEvent.pointerDown(viewport, { pointerId: 1, button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerDown(viewport, { pointerId: 2, button: 0, clientX: 100, clientY: 0 })
    fireEvent.pointerMove(viewport, { pointerId: 2, clientX: 200, clientY: 0 })
    expect(currentScale()).toBeCloseTo(2)

    fireEvent.click(screen.getByRole('button', { name: 'Tela cheia' }))
    expect(viewport.className).toContain('fixed')
  })

  it('draws its loupe locally without adding another protected image request surface', () => {
    render(<ImagePreviewViewer derivative={derivative} />)

    fireEvent.click(screen.getByRole('button', { name: 'Alternar lupa' }))

    const loupe = screen.getByTestId('protected-image-loupe')
    expect(loupe.tagName).toBe('CANVAS')
    expect(screen.getAllByRole('img', { name: 'Pré-visualização protegida' })).toHaveLength(1)
    expect(loupe.getAttribute('src')).toBeNull()
  })
})
