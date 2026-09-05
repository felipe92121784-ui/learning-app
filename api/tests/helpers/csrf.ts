import type { ApiClient, ApiRequest, ApiResponse } from '@japa/api-client'

export interface CsrfSession {
  name: string
  value: string
  xsrfName: string
  xsrfValue: string
  xsrfHeader: string
}

function xsrfHeaderValue(response: ApiResponse) {
  const setCookie = response.header('set-cookie')
  const xsrfCookie = (Array.isArray(setCookie) ? setCookie : [setCookie]).find((cookie) =>
    cookie?.startsWith('XSRF-TOKEN=')
  )
  const value = xsrfCookie?.match(/^XSRF-TOKEN=([^;]+)/)?.[1]
  if (!value) {
    throw new Error('Expected an encrypted XSRF-TOKEN response cookie')
  }

  return value
}

export function csrfSessionFrom(response: ApiResponse): CsrfSession {
  const sessionCookie = response.cookie('adonis-session')
  const xsrfCookie = response.cookie('XSRF-TOKEN')
  if (!sessionCookie || !xsrfCookie) {
    throw new Error('Expected session and XSRF cookies')
  }

  return {
    name: sessionCookie.name,
    value: sessionCookie.value,
    xsrfName: xsrfCookie.name,
    xsrfValue: xsrfCookie.value,
    xsrfHeader: xsrfHeaderValue(response),
  }
}

export function withCsrf(request: ApiRequest, session: CsrfSession) {
  return request
    .cookie(session.name, session.value)
    .cookie(session.xsrfName, session.xsrfValue)
    .header('x-xsrf-token', session.xsrfHeader)
}

export async function bootstrapCsrf(client: ApiClient) {
  const response = await client.get('/api/v1/account/profile')
  response.assertStatus(401)
  return csrfSessionFrom(response)
}

export async function postLogin(
  client: ApiClient,
  credentials: { email: string; password: string }
) {
  const csrf = await bootstrapCsrf(client)
  return withCsrf(client.post('/api/v1/auth/login'), csrf).unsafeJson(credentials)
}
