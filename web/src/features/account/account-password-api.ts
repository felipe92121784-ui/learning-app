import { apiClient } from '@/lib/api-client'

export interface UpdateAccountPasswordInput {
  currentPassword: string
  newPassword: string
  newPasswordConfirmation: string
}

export async function updateAccountPassword(
  input: UpdateAccountPasswordInput,
): Promise<void> {
  await apiClient('/account/password', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}
