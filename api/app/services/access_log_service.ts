import AccessLog, { type AccessLogAction } from '#models/access_log'
import { isIP } from 'node:net'

export interface CreateAccessLogInput {
  userId: number
  materialId: number
  action: AccessLogAction
  ipAddress?: string | null
  userAgent?: string | null
}

export default class AccessLogService {
  async record(input: CreateAccessLogInput) {
    return AccessLog.create({
      ...input,
      ipAddress: normalizeIpAddress(input.ipAddress),
      userAgent: limitUserAgent(input.userAgent),
    })
  }
}

function normalizeIpAddress(ipAddress: string | null | undefined) {
  const candidate = ipAddress?.trim()
  if (!candidate) {
    return null
  }

  const version = isIP(candidate)
  if (version === 4) {
    return candidate
  }
  if (version === 6) {
    return new URL(`http://[${candidate}]`).hostname.slice(1, -1)
  }

  return null
}

function limitUserAgent(userAgent: string | null | undefined) {
  if (!userAgent) {
    return null
  }

  return Array.from(userAgent).slice(0, 512).join('')
}
