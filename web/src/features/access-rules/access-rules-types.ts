export const ACCESS_RESOURCE_TYPES = ['COURSE', 'MODULE', 'MATERIAL'] as const
export const ACCESS_CAPABILITIES = ['VIEW', 'DOWNLOAD'] as const
export const ACCESS_EFFECTS = ['ALLOW', 'DENY', 'INHERIT'] as const
export const ACCESS_SOURCES = ['COURSE', 'MODULE', 'MATERIAL', 'DEFAULT'] as const

export type AccessResourceType = (typeof ACCESS_RESOURCE_TYPES)[number]
export type AccessCapability = (typeof ACCESS_CAPABILITIES)[number]
export type AccessEffect = (typeof ACCESS_EFFECTS)[number]
export type AccessSource = (typeof ACCESS_SOURCES)[number]

export interface AccessResource {
  type: AccessResourceType
  id: number
}

export interface AccessRuleTarget {
  userId: number
  resource: AccessResource
}

export interface AccessRule {
  id: number
  userId: number
  resourceType: AccessResourceType
  resourceId: number
  capability: AccessCapability
  effect: AccessEffect
  startsAt: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
}

export interface UpsertAccessRuleInput {
  userId: number
  resourceType: AccessResourceType
  resourceId: number
  capability: AccessCapability
  effect: AccessEffect
  startsAt: string | null
  expiresAt: string | null
}

export interface EffectiveAccessDecision {
  allowed: boolean
  decision: Exclude<AccessEffect, 'INHERIT'>
  source: AccessSource
  ruleId: number | null
}

export interface EffectiveAccess {
  view: EffectiveAccessDecision
  download: EffectiveAccessDecision
}
