import { apiClient } from '@/lib/api-client'
import type { OriginalDownload, ProtectedMaterialView } from './protected-viewer-types'

interface ApiEnvelope<T> {
  data: T
}

function requireData<T>(response: ApiEnvelope<T> | undefined): T {
  if (!response) throw new Error('Protected-viewer API returned no data')
  return response.data
}

export async function getProtectedMaterialView(
  materialId: number,
  signal?: AbortSignal,
): Promise<ProtectedMaterialView> {
  return requireData(
    await apiClient<ApiEnvelope<ProtectedMaterialView>>(`/materials/${materialId}/view`, { signal }),
  )
}

export async function requestOriginalDownload(materialId: number): Promise<OriginalDownload> {
  return requireData(
    await apiClient<ApiEnvelope<OriginalDownload>>(`/materials/${materialId}/download-url`, {
      method: 'POST',
    }),
  )
}
