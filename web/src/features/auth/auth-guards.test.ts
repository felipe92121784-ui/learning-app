import { describe, expect, it } from 'vitest'
import {
  getLoginDestination,
  redirectAuthenticatedUser,
  requireActiveUser,
  requireAdminUser,
} from './auth-guards'
import type { AuthUser } from './auth-types'

const student: AuthUser = {
  id: 7,
  fullName: 'Ada Student',
  email: 'ada@example.test',
  role: 'STUDENT',
  status: 'ACTIVE',
}

describe('authentication guards', () => {
  it('directs an unauthenticated visitor to login with a return path', () => {
    expect(() => requireActiveUser(null, '/app')).toThrowError(
      expect.objectContaining({
        options: expect.objectContaining({
          to: '/login',
          search: { redirect: '/app' },
        }),
      }),
    )
  })

  it('directs a student away from the admin area', () => {
    expect(() => requireAdminUser(student, '/admin')).toThrowError(
      expect.objectContaining({
        options: expect.objectContaining({ to: '/app' }),
      }),
    )
  })

  it('allows an active administrator into the admin area', () => {
    const admin: AuthUser = { ...student, role: 'ADMIN' }

    expect(requireAdminUser(admin, '/admin')).toEqual(admin)
  })

  it('directs an authenticated student away from login to the student portal', () => {
    expect(() => redirectAuthenticatedUser(student)).toThrowError(
      expect.objectContaining({
        options: expect.objectContaining({ to: '/app' }),
      }),
    )
  })

  it('directs an authenticated administrator away from login to administration', () => {
    const admin: AuthUser = { ...student, role: 'ADMIN' }

    expect(() => redirectAuthenticatedUser(admin)).toThrowError(
      expect.objectContaining({
        options: expect.objectContaining({ to: '/admin' }),
      }),
    )
  })

  it('uses an administrator return path only for an administrator', () => {
    const admin: AuthUser = { ...student, role: 'ADMIN' }

    expect(getLoginDestination(admin, '/admin/users')).toBe('/admin')
    expect(getLoginDestination(student, '/admin')).toBe('/app')
    expect(getLoginDestination(admin, 'https://malicious.example.test')).toBe(
      '/admin',
    )
  })
})
