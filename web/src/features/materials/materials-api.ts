import { apiClient } from '@/lib/api-client'
import type { Material, UpdateMaterialInput } from './materials-types'

interface ApiEnvelope<T> {
  data: T
}

function requireData<T>(response: ApiEnvelope<T> | undefined): T {
  if (!response) throw new Error('Materials API returned no data')
  return response.data
}

function jsonRequest(method: 'PATCH', body: unknown) {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

export async function listMaterials(moduleId: number): Promise<Material[]> {
  return requireData(await apiClient<ApiEnvelope<Material[]>>(`/modules/${moduleId}/materials`))
}

export async function uploadMaterial(
  moduleId: number,
  input: { title: string; description?: string; file: File },
): Promise<Material> {
  const body = new FormData()
  body.append('title', input.title)
  if (input.description) body.append('description', input.description)
  body.append('file', input.file)
  return requireData(
    await apiClient<ApiEnvelope<Material>>(`/modules/${moduleId}/materials`, {
      method: 'POST',
      body,
    }),
  )
}

export async function updateMaterial(
  moduleId: number,
  materialId: number,
  input: UpdateMaterialInput,
): Promise<Material> {
  return requireData(
    await apiClient<ApiEnvelope<Material>>(
      `/modules/${moduleId}/materials/${materialId}`,
      jsonRequest('PATCH', input),
    ),
  )
}

export async function deleteMaterial(moduleId: number, materialId: number): Promise<void> {
  await apiClient<void>(`/modules/${moduleId}/materials/${materialId}`, { method: 'DELETE' })
}
