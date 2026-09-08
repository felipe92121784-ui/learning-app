import { queryOptions, useQuery } from '@tanstack/react-query'
import { getAdminDashboard } from './admin-dashboard-api'

export const adminDashboardQueryKey = ['admin-dashboard'] as const

export function adminDashboardQueryOptions() {
  return queryOptions({
    queryKey: adminDashboardQueryKey,
    queryFn: getAdminDashboard,
  })
}

export function useAdminDashboardQuery() {
  return useQuery(adminDashboardQueryOptions())
}
