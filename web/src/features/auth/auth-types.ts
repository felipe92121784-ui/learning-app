export type UserRole = 'ADMIN' | 'STUDENT'
export type UserStatus = 'ACTIVE' | 'BLOCKED'

export interface AuthUser {
  id: number
  fullName: string
  email: string
  role: UserRole
  status: UserStatus
}

export interface LoginCredentials {
  email: string
  password: string
}
