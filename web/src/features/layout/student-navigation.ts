import { House, UserRound } from 'lucide-react'
import type { AppSidebarNavItem } from '@/components/layout/app-sidebar'

export const studentNavigationItems = [
  {
    label: 'Portal',
    to: '/app',
    icon: House,
    exact: true,
  },
  {
    label: 'Conta',
    to: '/app/account',
    icon: UserRound,
  },
] satisfies readonly AppSidebarNavItem[]
