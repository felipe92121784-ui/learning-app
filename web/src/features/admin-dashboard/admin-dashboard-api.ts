import { apiClient } from '@/lib/api-client'
import type { AdminDashboard } from './admin-dashboard-types'

interface ApiEnvelope<T> {
  data: T
}

export async function getAdminDashboard(): Promise<AdminDashboard> {
  const response = await apiClient<ApiEnvelope<AdminDashboard>>('/dashboard')
  if (!response) throw new Error('Dashboard API returned no data')
  return response.data
}
