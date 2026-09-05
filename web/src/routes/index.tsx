import { createFileRoute, redirect } from '@tanstack/react-router'
import { profileQueryOptions } from '@/features/auth/auth-api'
import { getLoginDestination } from '@/features/auth/auth-guards'

export const Route = createFileRoute('/')({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(
      profileQueryOptions(),
    )
    throw redirect({
      to: user?.status === 'ACTIVE' ? getLoginDestination(user) : '/login',
      replace: true,
    })
  },
})
