import type { AccessEffect } from './access-rules-types'

export const COURSE_PERMISSIONS = ['NONE', 'READ', 'FULL'] as const
export type CoursePermission = (typeof COURSE_PERMISSIONS)[number]

export function coursePermissionRules(permission: CoursePermission): {
  view: AccessEffect
  download: AccessEffect
} {
  switch (permission) {
    case 'NONE':
      return { view: 'DENY', download: 'DENY' }
    case 'READ':
      return { view: 'ALLOW', download: 'DENY' }
    case 'FULL':
      return { view: 'ALLOW', download: 'ALLOW' }
  }
}
