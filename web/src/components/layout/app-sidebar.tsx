import type { ComponentProps, PropsWithChildren, ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { CardTitle } from '@/components/ui/card'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import type { FileRoutesByTo } from '@/routeTree.gen'

export type AppSidebarRoute = Exclude<
  keyof FileRoutesByTo,
  `${string}$${string}`
>

export interface AppSidebarNavItem {
  label: string
  to: AppSidebarRoute
  icon: LucideIcon
  exact?: boolean
}

export interface AppSidebarProps extends PropsWithChildren {
  brand: string
  collapsed: boolean
  currentPath: string
  footer?: ReactNode
  items: readonly AppSidebarNavItem[]
  onCollapsedChange: (collapsed: boolean) => void
}

function normalizePath(path: string) {
  if (path === '/') {
    return path
  }

  return path.replace(/\/+$/, '')
}

function isItemActive(item: AppSidebarNavItem, currentPath: string) {
  const path = normalizePath(currentPath)
  const target = normalizePath(item.to)

  if (item.exact) {
    return path === target
  }

  return path === target || path.startsWith(`${target}/`)
}

function NavigationItems({
  currentPath,
  items,
}: Pick<AppSidebarProps, 'currentPath' | 'items'>) {
  const { setOpenMobile } = useSidebar()

  return (
    <nav aria-label="Navegação principal">
      <SidebarMenu>
        {items.map((item) => {
          const active = isItemActive(item, currentPath)
          const Icon = item.icon

          return (
            <SidebarMenuItem key={item.to}>
              <SidebarMenuButton
                asChild
                isActive={active}
                tooltip={item.label}
              >
                <Link
                  activeOptions={{ exact: item.exact }}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => setOpenMobile(false)}
                  to={item.to}
                >
                  <Icon aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </nav>
  )
}

export function AppSidebar({
  brand,
  children,
  collapsed,
  currentPath,
  footer,
  items,
  onCollapsedChange,
}: AppSidebarProps) {
  return (
    <SidebarProvider
      onOpenChange={(open) => onCollapsedChange(!open)}
      open={!collapsed}
    >
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex h-10 items-center gap-2 px-2">
            <Avatar aria-hidden="true">
              <AvatarFallback>IL</AvatarFallback>
            </Avatar>
            <CardTitle className="truncate group-data-[collapsible=icon]:hidden">
              {brand}
            </CardTitle>
          </div>
        </SidebarHeader>
        <SidebarSeparator />
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navegação</SidebarGroupLabel>
            <SidebarGroupContent>
              <NavigationItems currentPath={currentPath} items={items} />
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        {footer ? (
          <>
            <SidebarSeparator />
            <SidebarFooter>{footer}</SidebarFooter>
          </>
        ) : null}
        <SidebarRail />
      </Sidebar>
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  )
}

export function AppSidebarTrigger(
  props: Omit<ComponentProps<typeof SidebarTrigger>, 'aria-label' | 'title'>,
) {
  const { isMobile, open, openMobile } = useSidebar()
  const label = isMobile
    ? openMobile
      ? 'Fechar navegação'
      : 'Abrir navegação'
    : open
      ? 'Recolher navegação'
      : 'Expandir navegação'

  return <SidebarTrigger {...props} aria-label={label} title={label} />
}
