import { UserSchema } from '#database/schema'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { type AccessToken, DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'
import { hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import AccessRule from '#models/access_rule'
import AccessLog from '#models/access_log'

export const USER_ROLES = ['ADMIN', 'STUDENT'] as const
export type UserRole = (typeof USER_ROLES)[number]

export const USER_STATUSES = ['ACTIVE', 'BLOCKED'] as const
export type UserStatus = (typeof USER_STATUSES)[number]

export default class User extends compose(UserSchema, withAuthFinder(hash)) {
  static accessTokens = DbAccessTokensProvider.forModel(User)
  declare currentAccessToken?: AccessToken

  @hasMany(() => AccessRule)
  declare accessRules: HasMany<typeof AccessRule>

  @hasMany(() => AccessLog)
  declare accessLogs: HasMany<typeof AccessLog>

  get initials() {
    const [first, last] = this.fullName ? this.fullName.split(' ') : this.email.split('@')
    if (first && last) {
      return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
    }
    return `${first.slice(0, 2)}`.toUpperCase()
  }
}
