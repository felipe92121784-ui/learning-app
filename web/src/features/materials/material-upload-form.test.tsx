// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MaterialUploadForm } from './material-upload-form'

const settings = [{ type: 'PDF', maxSizeBytes: 100 * 1024 * 1024 }, { type: 'IMAGE', maxSizeBytes: 100 * 1024 * 1024 }, { type: 'ZIP', maxSizeBytes: 100 * 1024 * 1024 }] as const
function renderForm(onSuccess = vi.fn()) { const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } }); return { onSuccess, ...render(<QueryClientProvider client={client}><MaterialUploadForm moduleId={9} onSuccess={onSuccess} settings={[...settings]} /></QueryClientProvider>) } }
describe('MaterialUploadForm', () => {
  afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })
  it('uploads the selected file and reports its configured category limit', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { id: 2 } }))
    vi.stubGlobal('fetch', fetchMock)
    const { onSuccess } = renderForm()
    fireEvent.change(screen.getByLabelText('Arquivo'), { target: { files: [new File(['pdf'], 'manual.pdf', { type: 'application/pdf' })] } })
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Manual de segurança' } })
    expect(screen.getByText('PDF: até 100 MB.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Enviar material' }))
    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST', body: expect.any(FormData) })
  })
  it('shows the server error, re-enables the button, and does not call success on upload failure', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ message: 'Invalid file' }, { status: 422 })))
    const { onSuccess } = renderForm()
    fireEvent.change(screen.getByLabelText('Arquivo'), { target: { files: [new File(['pdf'], 'manual.pdf', { type: 'application/pdf' })] } })
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Manual de segurança' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar material' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('API request failed with status 422'))
    expect(screen.getByRole('button', { name: 'Enviar material' })).toHaveProperty('disabled', false)
    expect(onSuccess).not.toHaveBeenCalled()
  })
  it('rejects an unsupported selected file before sending it', () => {
    renderForm()
    fireEvent.change(screen.getByLabelText('Arquivo'), { target: { files: [new File(['text'], 'notes.txt', { type: 'text/plain' })] } })
    expect(screen.getByRole('alert').textContent).toContain('PDF, imagem ou ZIP')
  })
})
