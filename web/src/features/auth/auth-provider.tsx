/* eslint-disable react/only-export-components */
import {
  createContext,
  useContext,
  type PropsWithChildren,
} from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  login as loginRequest,
  logout as logoutRequest,
  profileQueryOptions,
} from './auth-api'
import { cacheLoggedInUser, clearAuthenticatedUser } from './auth-cache'
import type { AuthUser, LoginCredentials } from './auth-types'

interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  login: (credentials: LoginCredentials) => Promise<AuthUser>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient()
  const profileQuery = useQuery(profileQueryOptions())
  const loginMutation = useMutation({
    mutationFn: loginRequest,
    onSuccess: async (user) => {
      await cacheLoggedInUser(queryClient, user)
    },
  })
  const logoutMutation = useMutation({
    mutationFn: logoutRequest,
    onSuccess: async () => {
      await clearAuthenticatedUser(queryClient)
    },
  })

  return (
    <AuthContext.Provider
      value={{
        user: profileQuery.data ?? null,
        isLoading:
          profileQuery.isPending ||
          loginMutation.isPending ||
          logoutMutation.isPending,
        login: loginMutation.mutateAsync,
        logout: logoutMutation.mutateAsync,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }

  return context
}
