// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MaterialsList } from './materials-list'

const material = { id: 2, moduleId: 9, title: 'Manual', description: 'Leia antes da aula.', type: 'PDF' as const, originalFilename: 'manual.pdf', mimeType: 'application/pdf', size: 2 * 1024 * 1024, position: 0, processingStatus: 'PROCESSING' as const, createdAt: '2026-09-05T00:00:00Z', updatedAt: null }
function renderList(overrides = {}) { const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } }); return render(<QueryClientProvider client={client}><MaterialsList materials={[{ ...material, ...overrides }]} moduleId={9} /></QueryClientProvider>) }
describe('MaterialsList', () => {
  afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })
  it('shows safe metadata and requires explicit confirmation before deletion', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    renderList()
    expect(screen.getByText(/manual.pdf · PDF · 2 MB/)).toBeTruthy()
    expect(screen.getByText('Processando')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Excluir Manual' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'DELETE' })
  })
  it('shows a safe failed processing status without viewer or download actions', () => {
    renderList({ processingStatus: 'FAILED' as const, processingErrorCode: 'PDF_PAGE_LIMIT_EXCEEDED' })
    expect(screen.getByText('Falha no processamento')).toBeTruthy()
    expect(screen.getByText(/PDF_PAGE_LIMIT_EXCEEDED/)).toBeTruthy()
    expect(screen.queryByRole('link', { name: /baixar|visualizar/i })).toBeNull()
  })
  it('edits title and optional description through the nested PATCH endpoint', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { ...material, title: 'Manual revisado', description: null } }))
    vi.stubGlobal('fetch', fetchMock)
    renderList()
    fireEvent.click(screen.getByRole('button', { name: 'Editar Manual' }))
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Manual revisado' } })
    fireEvent.change(screen.getByLabelText('Descrição (opcional)'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/modules/9/materials/2')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'PATCH', body: JSON.stringify({ title: 'Manual revisado', description: null }) })
  })
  it('keeps the edit dialog open and shows an error when metadata update fails', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ message: 'Failed' }, { status: 500 })))
    renderList()
    fireEvent.click(screen.getByRole('button', { name: 'Editar Manual' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Não foi possível editar o material.'))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toHaveProperty('disabled', false)
  })
})
