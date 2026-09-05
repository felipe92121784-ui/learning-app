// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UploadSettingsForm } from './upload-settings-form'

const settings = [{ type: 'PDF', maxSizeBytes: 100 * 1024 * 1024 }, { type: 'IMAGE', maxSizeBytes: 100 * 1024 * 1024 }, { type: 'ZIP', maxSizeBytes: 100 * 1024 * 1024 }] as const
describe('UploadSettingsForm', () => {
  afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })
  it('updates every configured type in MB', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { type: 'PDF', maxSizeBytes: 200 * 1024 * 1024 } }))
    vi.stubGlobal('fetch', fetchMock)
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    render(<QueryClientProvider client={client}><UploadSettingsForm settings={[...settings]} /></QueryClientProvider>)
    fireEvent.change(screen.getByLabelText('PDF (MB)'), { target: { value: '200' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar limites' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'PATCH', body: JSON.stringify({ maxSizeMb: 200 }) })
  })
  it('keeps values within the technical range on the client', () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    render(<QueryClientProvider client={client}><UploadSettingsForm settings={[...settings]} /></QueryClientProvider>)
    fireEvent.change(screen.getByLabelText('ZIP (MB)'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar limites' }))
    expect(screen.getByRole('alert').textContent).toContain('entre 1 e 1024 MB')
  })
  it('surfaces a partial save failure instead of claiming success', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/api/v1')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ data: { type: 'PDF', maxSizeBytes: 100 } }))
      .mockResolvedValueOnce(Response.json({ message: 'Failed' }, { status: 500 }))
      .mockResolvedValueOnce(Response.json({ data: { type: 'ZIP', maxSizeBytes: 100 } }))
    vi.stubGlobal('fetch', fetchMock)
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    render(<QueryClientProvider client={client}><UploadSettingsForm settings={[...settings]} /></QueryClientProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Salvar limites' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Não foi possível salvar todos os limites'))
    expect(screen.queryByText('Limites salvos com sucesso.')).toBeNull()
    expect(screen.getByRole('button', { name: 'Salvar limites' })).toHaveProperty('disabled', false)
  })
})
