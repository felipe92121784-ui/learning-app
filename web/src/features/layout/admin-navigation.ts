import { BookOpen, LayoutDashboard, Settings, Users } from 'lucide-react'
import type { AppSidebarNavItem } from '@/components/layout/app-sidebar'

export const adminNavigationItems = [
  {
    label: 'Visão geral',
    to: '/admin',
    icon: LayoutDashboard,
    exact: true,
  },
  {
    label: 'Usuários',
    to: '/admin/users',
    icon: Users,
  },
  {
    label: 'Cursos',
    to: '/admin/courses',
    icon: BookOpen,
  },
  {
    label: 'Configurações',
    to: '/admin/settings',
    icon: Settings,
  },
] satisfies readonly AppSidebarNavItem[]
