import { QueryClient } from '@tanstack/react-query'
import { createRouter, type RouterHistory } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

interface CreateAppRouterOptions {
  queryClient: QueryClient
  history?: RouterHistory
  isServer?: boolean
  origin?: string
}

export function createAppRouter({
  queryClient,
  history,
  isServer,
  origin,
}: CreateAppRouterOptions) {
  return createRouter({
    routeTree,
    context: { queryClient },
    history,
    isServer,
    origin,
  })
}

export const queryClient = new QueryClient()
export const router = createAppRouter({ queryClient })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
