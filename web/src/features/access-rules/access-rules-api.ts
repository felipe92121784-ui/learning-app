import { apiClient } from '@/lib/api-client'
import type {
  AccessRule,
  AccessRuleTarget,
  EffectiveAccess,
  UpsertAccessRuleInput,
} from './access-rules-types'

interface ApiEnvelope<T> {
  data: T
}

function requireData<T>(response: ApiEnvelope<T> | undefined): T {
  if (!response) {
    throw new Error('Access-rules API returned no data')
  }

  return response.data
}

function targetQuery(target: AccessRuleTarget): string {
  return new URLSearchParams({
    userId: String(target.userId),
    resourceType: target.resource.type,
    resourceId: String(target.resource.id),
  }).toString()
}

export async function listAccessRules(
  target: AccessRuleTarget,
): Promise<AccessRule[]> {
  return requireData(
    await apiClient<ApiEnvelope<AccessRule[]>>(
      `/access-rules?${targetQuery(target)}`,
    ),
  )
}

export async function upsertAccessRule(
  input: UpsertAccessRuleInput,
): Promise<AccessRule> {
  return requireData(
    await apiClient<ApiEnvelope<AccessRule>>('/access-rules', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  )
}

export async function deleteAccessRule(ruleId: number): Promise<void> {
  await apiClient<void>(`/access-rules/${ruleId}`, { method: 'DELETE' })
}

export async function getEffectiveAccess(
  target: AccessRuleTarget,
): Promise<EffectiveAccess> {
  return requireData(
    await apiClient<ApiEnvelope<EffectiveAccess>>(
      `/access-rules/effective?${targetQuery(target)}`,
    ),
  )
}
