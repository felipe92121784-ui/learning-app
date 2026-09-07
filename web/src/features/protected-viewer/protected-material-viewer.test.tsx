// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProtectedMaterialView } from './protected-viewer-types'
import { ProtectedMaterialViewer } from './protected-material-viewer'
import { cacheLoggedInUser, clearAuthenticatedUser } from '../auth/auth-cache'
import { protectedMaterialViewQueryOptions } from './protected-viewer-queries'

const pdfView: ProtectedMaterialView = {
  id: 14,
  title: 'Manual protegido',
  type: 'PDF',
  viewer: {
    kind: 'PDF_PAGES',
    derivatives: [
      {
        id: 42,
        pageNumber: 2,
        width: 1200,
        height: 1600,
        position: 1,
        contentUrl: 'https://api.example.test/api/v1/materials/14/derivatives/42',
      },
      {
        id: 41,
        pageNumber: 1,
        width: 1200,
        height: 1600,
        position: 0,
        contentUrl: 'https://api.example.test/api/v1/materials/14/derivatives/41',
      },
    ],
  },
  download: { allowed: false },
}

function queryHarness() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
  return Wrapper
}

describe('ProtectedMaterialViewer', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders ordered protected PDF pages with loading/error feedback and no denied download', () => {
    render(<ProtectedMaterialViewer view={pdfView} />)

    const pages = screen.getAllByRole('img', { name: /página/i })
    expect(pages).toHaveLength(2)
    expect(pages.map((page) => page.getAttribute('alt'))).toEqual(['Página 1', 'Página 2'])
    expect(pages.map((page) => page.getAttribute('src'))).toEqual([
      'https://api.example.test/api/v1/materials/14/derivatives/41',
      'https://api.example.test/api/v1/materials/14/derivatives/42',
    ])
    expect(screen.queryByRole('button', { name: /baixar original/i })).toBeNull()
    expect(document.body.textContent).not.toContain('originals/')

    expect(screen.getAllByText(/carregando página/i)).toHaveLength(2)
    fireEvent.load(pages[0]!)
    expect(screen.queryByText('Carregando página 1…')).toBeNull()
    fireEvent.error(pages[1]!)
    expect(screen.getByRole('alert').textContent).toContain('Não foi possível carregar a página 2.')
  })

  it('navigates only after a delayed authorization even without transient user activation', async () => {
    const signedUrl = 'https://downloads.example.test/five-minute-url'
    let resolveDownload: (response: Response) => void = () => undefined
    const response = new Promise<Response>((resolve) => {
      resolveDownload = resolve
    })
    const open = vi.fn()
    vi.stubGlobal('navigator', Object.create(navigator, {
      userActivation: { value: { isActive: false } },
    }))
    const navigate = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.href).toBe(signedUrl)
      expect(this.target).toBe('_self')
      expect(this.rel).toBe('noopener noreferrer')
      expect(this.referrerPolicy).toBe('no-referrer')
      expect(navigator.userActivation.isActive).toBe(false)
    })
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(response))
    vi.stubGlobal('open', open)

    render(<ProtectedMaterialViewer view={{ ...pdfView, download: { allowed: true } }} />)
    const download = screen.getByRole('button', { name: 'Baixar original' })
    fireEvent.click(download)

    expect(download).toHaveProperty('disabled', true)
    expect(open).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain(signedUrl)

    resolveDownload(
      Response.json({ data: { url: signedUrl, expiresAt: '2026-09-06T12:05:00.000Z' } }),
    )
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1))
    expect(open).not.toHaveBeenCalled()
    expect(document.body.innerHTML).not.toContain(signedUrl)
    expect((navigate.mock.contexts[0] as HTMLAnchorElement).getAttribute('href')).toBeNull()
  })

  it('does not open a window when the ephemeral download action fails', async () => {
    const open = vi.fn()
    const navigate = vi.spyOn(HTMLAnchorElement.prototype, 'click')
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ message: 'storage key originals/private' }, { status: 500 })),
    )
    vi.stubGlobal('open', open)

    render(<ProtectedMaterialViewer view={{ ...pdfView, download: { allowed: true } }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Baixar original' }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByRole('alert').textContent).toBe('Não foi possível preparar o download. Tente novamente.')
    expect(open).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain('originals/private')
  })

  it('reports navigation setup failures and discards the temporary URL', async () => {
    const signedUrl = 'https://downloads.example.test/five-minute-url'
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      data: { url: signedUrl, expiresAt: '2026-09-06T12:05:00.000Z' },
    })))
    const navigate = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error(`Could not navigate to ${signedUrl}`)
    })
    render(<ProtectedMaterialViewer view={{ ...pdfView, download: { allowed: true } }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Baixar original' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(
      'Não foi possível preparar o download. Tente novamente.',
    ))
    expect(document.body.innerHTML).not.toContain(signedUrl)
    expect((navigate.mock.contexts[0] as HTMLAnchorElement).getAttribute('href')).toBeNull()
  })

  it('shows safe query loading/error states and no viewer for ZIP', async () => {
    let rejectManifest: (reason: Error) => void = () => undefined
    const response = new Promise<Response>((_resolve, reject) => {
      rejectManifest = reject
    })
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(response))

    const { rerender } = render(<ProtectedMaterialViewer materialId={14} />, {
      wrapper: queryHarness(),
    })
    expect(screen.getByRole('status').textContent).toContain('Carregando material protegido')

    rejectManifest(new Error('storage key originals/private'))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByRole('alert').textContent).toBe('Não foi possível carregar este material.')
    expect(document.body.textContent).not.toContain('originals/private')

    rerender(
      <ProtectedMaterialViewer
        view={{ id: 15, title: 'Arquivos', type: 'ZIP', viewer: null, download: { allowed: false } }}
      />,
    )
    expect(screen.getByText('Este tipo de material não possui visualização nesta fase.')).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByRole('button', { name: /baixar original/i })).toBeNull()
  })

  it('selects the tiled image viewer without rendering its protected manifest URL', () => {
    const manifestUrl = 'https://api.example.test/api/v1/materials/16/tiles/manifest'
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>(() => undefined)))

    render(
      <ProtectedMaterialViewer
        view={{
          id: 16,
          title: 'Imagem grande',
          type: 'IMAGE',
          viewer: { kind: 'IMAGE_TILES', manifestUrl },
          download: { allowed: false },
        } as unknown as ProtectedMaterialView}
      />,
    )

    expect(screen.getByRole('status').textContent).toContain('Carregando imagem protegida')
    expect(screen.queryByRole('img', { name: 'Pré-visualização protegida' })).toBeNull()
    expect(document.body.textContent).not.toContain(manifestUrl)
  })

  it('renders no manifest or download permission from A while B loads the same material', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const a = { id: 7, fullName: 'A', email: 'a@example.test', role: 'STUDENT', status: 'ACTIVE' } as const
    await cacheLoggedInUser(client, a)
    client.setQueryData(protectedMaterialViewQueryOptions(14).queryKey, {
      ...pdfView, title: 'A confidential material', download: { allowed: true },
    })
    let finishA!: (response: Response) => void
    let denyB!: (response: Response) => void
    const responseA = new Promise<Response>((resolve) => { finishA = resolve })
    const responseB = new Promise<Response>((resolve) => { denyB = resolve })
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    // Intentionally ignores AbortSignal: even a non-cooperative old request must not restore A.
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(responseA).mockReturnValue(responseB))
    render(<QueryClientProvider client={client}><ProtectedMaterialViewer materialId={14} /></QueryClientProvider>)
    expect(screen.getByText('A confidential material')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Baixar original' })).toBeTruthy()
    await act(async () => {
      await clearAuthenticatedUser(client)
      await cacheLoggedInUser(client, { ...a, id: 8, fullName: 'B' })
    })
    await waitFor(() => expect(screen.queryByText('A confidential material')).toBeNull())
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Baixar original' })).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('Carregando material protegido')
    await act(async () => {
      finishA(Response.json({ data: { ...pdfView, title: 'A confidential material', download: { allowed: true } } }))
    })
    expect(document.body.innerHTML).not.toContain('A confidential material')
    expect(screen.queryByRole('img')).toBeNull()
    await act(async () => { denyB(new Response(null, { status: 403 })) })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Não foi possível carregar este material.'))
    expect(screen.queryByRole('button', { name: 'Baixar original' })).toBeNull()
    cleanup()
    client.clear()
  })
})
