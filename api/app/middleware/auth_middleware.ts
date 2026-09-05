import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { errors } from '@adonisjs/auth'
import type { Authenticators } from '@adonisjs/auth/types'

/**
 * Auth middleware is used authenticate HTTP requests and deny
 * access to unauthenticated users.
 */
export default class AuthMiddleware {
  async handle(
    ctx: HttpContext,
    next: NextFn,
    options: {
      guards?: (keyof Authenticators)[]
    } = {}
  ) {
    await ctx.auth.authenticateUsing(options.guards)

    if (options.guards?.includes('web')) {
      const webGuard = ctx.auth.use('web')

      if (webGuard.getUserOrFail().status !== 'ACTIVE') {
        await webGuard.logout()
        throw new errors.E_UNAUTHORIZED_ACCESS('Invalid or expired user session', {
          guardDriverName: webGuard.driverName,
        })
      }
    }

    return next()
  }
}
