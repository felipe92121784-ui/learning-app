import { redirect } from '@tanstack/react-router'
import type { AuthUser } from './auth-types'

export function requireActiveUser(
  user: AuthUser | null,
  returnPath: string,
): AuthUser {
  if (!user || user.status !== 'ACTIVE') {
    throw redirect({
      to: '/login',
      search: { redirect: returnPath },
      replace: true,
    })
  }

  return user
}

export function requireAdminUser(
  user: AuthUser | null,
  returnPath: string,
): AuthUser {
  const activeUser = requireActiveUser(user, returnPath)

  if (activeUser.role !== 'ADMIN') {
    throw redirect({ to: '/app', replace: true })
  }

  return activeUser
}

export function redirectAuthenticatedUser(user: AuthUser | null): void {
  if (user?.status === 'ACTIVE') {
    throw redirect({ to: getLoginDestination(user), replace: true })
  }
}

export function getLoginDestination(
  user: AuthUser,
  returnPath?: string,
): '/app' | '/admin' {
  if (user.role === 'ADMIN' && returnPath?.startsWith('/admin')) {
    return '/admin'
  }

  return user.role === 'ADMIN' ? '/admin' : '/app'
}
