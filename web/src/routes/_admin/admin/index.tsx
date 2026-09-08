/* eslint-disable react/only-export-components */
import { createFileRoute } from '@tanstack/react-router'
import { AdminDashboardView } from '@/features/admin-dashboard/admin-dashboard'
import { adminDashboardQueryOptions } from '@/features/admin-dashboard/admin-dashboard-queries'

export const Route = createFileRoute('/_admin/admin/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(adminDashboardQueryOptions()),
  component: AdminPage,
})

function AdminPage() {
  return <AdminDashboardView />
}
