import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteAccessRule,
  getEffectiveAccess,
  listAccessRules,
  upsertAccessRule,
} from './access-rules-api'
import type {
  AccessRuleTarget,
  UpsertAccessRuleInput,
} from './access-rules-types'

export const accessRulesQueryKeys = {
  all: ['access-rules'] as const,
  direct: (target: AccessRuleTarget) =>
    [
      'access-rules',
      'direct',
      target.userId,
      target.resource.type,
      target.resource.id,
    ] as const,
  effective: (target: AccessRuleTarget) =>
    [
      'access-rules',
      'effective',
      target.userId,
      target.resource.type,
      target.resource.id,
    ] as const,
}

export function accessRulesQueryOptions(target: AccessRuleTarget) {
  return queryOptions({
    queryKey: accessRulesQueryKeys.direct(target),
    queryFn: () => listAccessRules(target),
  })
}

export function effectiveAccessQueryOptions(target: AccessRuleTarget) {
  return queryOptions({
    queryKey: accessRulesQueryKeys.effective(target),
    queryFn: () => getEffectiveAccess(target),
  })
}

export function useAccessRulesQuery(target: AccessRuleTarget) {
  return useQuery(accessRulesQueryOptions(target))
}

export function useEffectiveAccessQuery(target: AccessRuleTarget) {
  return useQuery(effectiveAccessQueryOptions(target))
}

function targetFromInput(input: UpsertAccessRuleInput): AccessRuleTarget {
  return {
    userId: input.userId,
    resource: { type: input.resourceType, id: input.resourceId },
  }
}

async function refreshTarget(queryClient: ReturnType<typeof useQueryClient>, target: AccessRuleTarget) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: accessRulesQueryKeys.direct(target),
    }),
    queryClient.invalidateQueries({
      queryKey: accessRulesQueryKeys.effective(target),
    }),
  ])
}

export function useUpsertAccessRuleMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: upsertAccessRule,
    onSuccess: async (_rule, input) => {
      await refreshTarget(queryClient, targetFromInput(input))
    },
  })
}

interface DeleteAccessRuleVariables {
  ruleId: number
  target: AccessRuleTarget
}

export function useDeleteAccessRuleMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ ruleId }: DeleteAccessRuleVariables) => deleteAccessRule(ruleId),
    onSuccess: async (_result, { target }) => {
      await refreshTarget(queryClient, target)
    },
  })
}
