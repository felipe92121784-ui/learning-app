// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImageViewerControls } from './image-viewer-controls'

describe('ImageViewerControls', () => {
  afterEach(() => {
    cleanup()
  })

  it('exposes every accessible image action through its supplied callbacks', () => {
    const onZoomIn = vi.fn()
    const onZoomOut = vi.fn()
    const onFit = vi.fn()
    const onReset = vi.fn()
    const onFullscreen = vi.fn()
    const onLoupe = vi.fn()

    render(
      <ImageViewerControls
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onFit={onFit}
        onReset={onReset}
        onFullscreen={onFullscreen}
        onLoupe={onLoupe}
        loupeActive={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Aumentar zoom' }))
    fireEvent.click(screen.getByRole('button', { name: 'Diminuir zoom' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ajustar à tela' }))
    fireEvent.click(screen.getByRole('button', { name: 'Redefinir visualização' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tela cheia' }))
    const loupe = screen.getByRole('button', { name: 'Alternar lupa' })
    fireEvent.click(loupe)

    expect(onZoomIn).toHaveBeenCalledOnce()
    expect(onZoomOut).toHaveBeenCalledOnce()
    expect(onFit).toHaveBeenCalledOnce()
    expect(onReset).toHaveBeenCalledOnce()
    expect(onFullscreen).toHaveBeenCalledOnce()
    expect(onLoupe).toHaveBeenCalledOnce()
    expect(loupe.getAttribute('aria-pressed')).toBe('false')
  })
})
