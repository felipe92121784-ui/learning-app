import type { UserRole, UserStatus } from '@/features/auth/auth-types'

export interface ManagedUser {
  id: number
  fullName: string
  email: string
  role: UserRole
  status: UserStatus
  initials: string
  createdAt: string
  updatedAt: string
}

export interface CreateUserInput {
  fullName: string
  email: string
  password: string
}

export interface UpdateUserInput {
  fullName: string
  email: string
}

export type { UserStatus }
