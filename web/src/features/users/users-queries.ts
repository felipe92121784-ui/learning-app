import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import {
  createUser,
  getUser,
  listUsers,
  updateUser,
  updateUserStatus,
} from './users-api'
import type {
  CreateUserInput,
  ManagedUser,
  UpdateUserInput,
  UserStatus,
} from './users-types'

export const usersQueryKeys = {
  all: ['users'] as const,
  list: () => ['users', 'list'] as const,
  detail: (userId: number) => ['users', 'detail', userId] as const,
}

export function usersQueryOptions() {
  return queryOptions({
    queryKey: usersQueryKeys.list(),
    queryFn: listUsers,
  })
}

export function userQueryOptions(userId: number) {
  return queryOptions({
    queryKey: usersQueryKeys.detail(userId),
    queryFn: () => getUser(userId),
  })
}

export function useUsersQuery() {
  return useQuery(usersQueryOptions())
}

export function useUserQuery(userId: number) {
  return useQuery(userQueryOptions(userId))
}

function cacheUser(queryClient: QueryClient, user: ManagedUser) {
  queryClient.setQueryData(usersQueryKeys.detail(user.id), user)
  queryClient.setQueryData<ManagedUser[]>(usersQueryKeys.list(), (users) =>
    users?.map((currentUser) =>
      currentUser.id === user.id ? user : currentUser,
    ),
  )
}

async function refreshUserQueries(
  queryClient: QueryClient,
  userId: number,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: usersQueryKeys.list() }),
    queryClient.invalidateQueries({ queryKey: usersQueryKeys.detail(userId) }),
  ])
}

export function useCreateUserMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateUserInput) => createUser(input),
    onSuccess: async (user) => {
      queryClient.setQueryData(usersQueryKeys.detail(user.id), user)
      queryClient.setQueryData<ManagedUser[]>(usersQueryKeys.list(), (users) =>
        users ? [...users, user] : [user],
      )
      await queryClient.invalidateQueries({ queryKey: usersQueryKeys.list() })
    },
  })
}

interface UpdateUserVariables {
  userId: number
  input: UpdateUserInput
}

export function useUpdateUserMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ userId, input }: UpdateUserVariables) =>
      updateUser(userId, input),
    onSuccess: async (user) => {
      cacheUser(queryClient, user)
      await refreshUserQueries(queryClient, user.id)
    },
  })
}

interface UpdateUserStatusVariables {
  userId: number
  status: UserStatus
}

export function useUpdateUserStatusMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ userId, status }: UpdateUserStatusVariables) =>
      updateUserStatus(userId, status),
    onSuccess: async (user) => {
      cacheUser(queryClient, user)
      await refreshUserQueries(queryClient, user.id)
    },
  })
}
