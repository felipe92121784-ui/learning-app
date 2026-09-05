import { apiClient } from '@/lib/api-client'
import type {
  CreateUserInput,
  ManagedUser,
  UpdateUserInput,
  UserStatus,
} from './users-types'

interface ApiEnvelope<T> {
  data: T
}

function requireData<T>(response: ApiEnvelope<T> | undefined): T {
  if (!response) {
    throw new Error('Users API returned no data')
  }

  return response.data
}

export async function listUsers(): Promise<ManagedUser[]> {
  return requireData(await apiClient<ApiEnvelope<ManagedUser[]>>('/users'))
}

export async function getUser(userId: number): Promise<ManagedUser> {
  return requireData(
    await apiClient<ApiEnvelope<ManagedUser>>(`/users/${userId}`),
  )
}

export async function createUser(
  input: CreateUserInput,
): Promise<ManagedUser> {
  return requireData(
    await apiClient<ApiEnvelope<ManagedUser>>('/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  )
}

export async function updateUser(
  userId: number,
  input: UpdateUserInput,
): Promise<ManagedUser> {
  return requireData(
    await apiClient<ApiEnvelope<ManagedUser>>(`/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  )
}

export async function updateUserStatus(
  userId: number,
  status: UserStatus,
): Promise<ManagedUser> {
  return requireData(
    await apiClient<ApiEnvelope<ManagedUser>>(`/users/${userId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }),
  )
}
