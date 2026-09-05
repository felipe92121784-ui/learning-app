import { apiClient } from './api-client'

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false

type Assert<Condition extends true> = Condition

type ApiClientResponse = Awaited<ReturnType<typeof apiClient<{ id: string }>>>

type ApiClientCanReturnNoContent = Assert<Equal<ApiClientResponse, { id: string } | undefined>>

export type ApiClientTypecheck = ApiClientCanReturnNoContent
