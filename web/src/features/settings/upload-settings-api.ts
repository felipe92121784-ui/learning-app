import { apiClient } from '@/lib/api-client'
import type { MaterialType, UploadSetting } from '@/features/materials/materials-types'

interface ApiEnvelope<T> { data: T }

function requireData<T>(response: ApiEnvelope<T> | undefined): T {
  if (!response) throw new Error('Upload settings API returned no data')
  return response.data
}

export async function listUploadSettings(): Promise<UploadSetting[]> {
  return requireData(await apiClient<ApiEnvelope<UploadSetting[]>>('/upload-settings'))
}

export async function updateUploadSetting(type: MaterialType, maxSizeMb: number): Promise<UploadSetting> {
  return requireData(await apiClient<ApiEnvelope<UploadSetting>>(`/upload-settings/${type}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ maxSizeMb }),
  }))
}
