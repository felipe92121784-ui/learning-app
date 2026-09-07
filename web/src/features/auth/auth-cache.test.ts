import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { protectedMaterialViewQueryOptions } from '../protected-viewer/protected-viewer-queries'
import type { ProtectedMaterialView } from '../protected-viewer/protected-viewer-types'
import {
  studentCatalogKeys,
  studentCourseQueryOptions,
  studentCoursesQueryOptions,
} from '../student-catalog/student-catalog-queries'
import type {
  StudentCourseDetail,
  StudentCourseSummary,
} from '../student-catalog/student-catalog-types'
import { profileQueryKey, profileQueryOptions } from './auth-api'
import { cacheLoggedInUser, clearAuthenticatedUser } from './auth-cache'
import type { AuthUser } from './auth-types'

const student: AuthUser = {
  id: 7,
  fullName: 'Ada Student',
  email: 'ada@example.test',
  role: 'STUDENT',
  status: 'ACTIVE',
}

describe('authentication cache updates', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('stores the login response and invalidates the profile query', async () => {
    const queryClient = new QueryClient()

    await cacheLoggedInUser(queryClient, student)

    expect(queryClient.getQueryData(profileQueryKey)).toEqual(student)
    expect(queryClient.getQueryState(profileQueryKey)?.isInvalidated).toBe(true)
  })

  it('clears the user and invalidates the profile query after logout', async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(profileQueryKey, student)

    await clearAuthenticatedUser(queryClient)

    expect(queryClient.getQueryData(profileQueryKey)).toBeNull()
    expect(queryClient.getQueryState(profileQueryKey)?.isInvalidated).toBe(true)
  })

  it.each(['logout', 'login', 'expiry'] as const)(
    'removes A from live observers on %s and ignores a late A response while B is pending/denied',
    async (transition) => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      queryClient.setQueryData(profileQueryKey, student)
      const a: ProtectedMaterialView = {
        id: 14, title: 'A confidential material', type: 'PDF',
        viewer: { kind: 'PDF_PAGES', derivatives: [{ id: 41, pageNumber: 1, width: 100,
          height: 100, position: 0, contentUrl: 'https://api.test/materials/14/derivatives/41' }] },
        download: { allowed: true },
      }
      const key = protectedMaterialViewQueryOptions(14).queryKey
      queryClient.setQueryData(key, a)
      let finishA!: (value: ProtectedMaterialView) => void
      const lateA = new Promise<ProtectedMaterialView>((resolve) => { finishA = resolve })
      const observerA = new QueryObserver(queryClient, {
        ...protectedMaterialViewQueryOptions(14), queryFn: () => lateA,
      })
      const unsubscribeA = observerA.subscribe(() => undefined)
      expect(observerA.getCurrentResult().data).toEqual(a)
      expect(observerA.getCurrentResult().fetchStatus).toBe('fetching')

      const b = { ...student, id: 8, fullName: 'B Student' }
      if (transition === 'logout') await clearAuthenticatedUser(queryClient)
      if (transition === 'login') await cacheLoggedInUser(queryClient, b)
      if (transition === 'expiry') {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })))
        // The profile query, as mounted by AuthProvider, detects an expired session.
        vi.stubEnv('VITE_API_URL', 'https://api.test')
        await queryClient.fetchQuery({ ...profileQueryOptions(), staleTime: 0 })
      }
      expect(observerA.getCurrentResult().data).toBeUndefined()
      expect(observerA.getCurrentResult().isPending).toBe(true)
      expect(queryClient.getQueryData(key)).toBeUndefined()
      unsubscribeA()
      await cacheLoggedInUser(queryClient, b)

      let denyB!: (reason: Error) => void
      const pendingB = new Promise<ProtectedMaterialView>((_resolve, reject) => { denyB = reject })
      const observerB = new QueryObserver(queryClient, {
        ...protectedMaterialViewQueryOptions(14), queryFn: () => pendingB,
      })
      const observedB: unknown[] = []
      const unsubscribeB = observerB.subscribe((result) => observedB.push(result.data))
      expect(observerB.getCurrentResult().isPending).toBe(true)
      expect(observerB.getCurrentResult().data).toBeUndefined()
      finishA(a)
      await lateA
      await Promise.resolve()
      expect(observerB.getCurrentResult().data).toBeUndefined()
      expect(queryClient.getQueryData(key)).toBeUndefined()
      denyB(new Error('403'))
      await vi.waitFor(() => expect(observerB.getCurrentResult().isError).toBe(true))
      expect(observedB.every((data) => data === undefined)).toBe(true)
      expect(JSON.stringify(queryClient.getQueryCache().getAll())).not.toContain(a.title)
      unsubscribeB()
      queryClient.clear()
    },
  )

  it.each(['logout', 'login', 'expiry'] as const)(
    'removes A catalog list/detail on %s and ignores their late responses for B',
    async (transition) => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      queryClient.setQueryData(profileQueryKey, student)
      const summaryA: StudentCourseSummary = {
        id: 14,
        title: 'A private course title',
        description: null,
        moduleCount: 1,
      }
      const detailA: StudentCourseDetail = {
        ...summaryA,
        modules: [{
          id: 21,
          title: 'A private module title',
          description: null,
          availability: 'AVAILABLE',
          materials: [{
            id: 42,
            title: 'A private material title',
            description: null,
            type: 'PDF',
            availability: 'AVAILABLE',
          }],
        }],
      }
      queryClient.setQueryData(studentCatalogKeys.courses(), [summaryA])
      queryClient.setQueryData(studentCatalogKeys.detail(14), detailA)

      let finishListA!: (value: StudentCourseSummary[]) => void
      let finishDetailA!: (value: StudentCourseDetail) => void
      const lateListA = new Promise<StudentCourseSummary[]>((resolve) => {
        finishListA = resolve
      })
      const lateDetailA = new Promise<StudentCourseDetail>((resolve) => {
        finishDetailA = resolve
      })
      const listObserverA = new QueryObserver(queryClient, {
        ...studentCoursesQueryOptions(),
        queryFn: () => lateListA,
      })
      const detailObserverA = new QueryObserver(queryClient, {
        ...studentCourseQueryOptions(14),
        queryFn: () => lateDetailA,
      })
      const unsubscribeListA = listObserverA.subscribe(() => undefined)
      const unsubscribeDetailA = detailObserverA.subscribe(() => undefined)
      expect(listObserverA.getCurrentResult().data).toEqual([summaryA])
      expect(detailObserverA.getCurrentResult().data).toEqual(detailA)

      const studentB = { ...student, id: 8, fullName: 'B Student' }
      if (transition === 'logout') await clearAuthenticatedUser(queryClient)
      if (transition === 'login') await cacheLoggedInUser(queryClient, studentB)
      if (transition === 'expiry') {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })))
        vi.stubEnv('VITE_API_URL', 'https://api.test')
        await queryClient.fetchQuery({ ...profileQueryOptions(), staleTime: 0 })
      }

      expect(listObserverA.getCurrentResult().data).toBeUndefined()
      expect(detailObserverA.getCurrentResult().data).toBeUndefined()
      expect(queryClient.getQueryData(studentCatalogKeys.courses())).toBeUndefined()
      expect(queryClient.getQueryData(studentCatalogKeys.detail(14))).toBeUndefined()
      unsubscribeListA()
      unsubscribeDetailA()
      if (transition !== 'login') await cacheLoggedInUser(queryClient, studentB)

      let denyListB!: (reason: Error) => void
      let denyDetailB!: (reason: Error) => void
      const pendingListB = new Promise<StudentCourseSummary[]>((_resolve, reject) => {
        denyListB = reject
      })
      const pendingDetailB = new Promise<StudentCourseDetail>((_resolve, reject) => {
        denyDetailB = reject
      })
      const listObserverB = new QueryObserver(queryClient, {
        ...studentCoursesQueryOptions(),
        queryFn: () => pendingListB,
      })
      const detailObserverB = new QueryObserver(queryClient, {
        ...studentCourseQueryOptions(14),
        queryFn: () => pendingDetailB,
      })
      const observedB: unknown[] = []
      const unsubscribeListB = listObserverB.subscribe((result) => observedB.push(result.data))
      const unsubscribeDetailB = detailObserverB.subscribe((result) => observedB.push(result.data))

      finishListA([summaryA])
      finishDetailA(detailA)
      await Promise.all([lateListA, lateDetailA])
      await Promise.resolve()

      expect(listObserverB.getCurrentResult().data).toBeUndefined()
      expect(detailObserverB.getCurrentResult().data).toBeUndefined()
      expect(JSON.stringify(queryClient.getQueryCache().getAll())).not.toContain('A private')
      denyListB(new Error('403'))
      denyDetailB(new Error('403'))
      await vi.waitFor(() => {
        expect(listObserverB.getCurrentResult().isError).toBe(true)
        expect(detailObserverB.getCurrentResult().isError).toBe(true)
      })
      expect(observedB.every((data) => data === undefined)).toBe(true)
      unsubscribeListB()
      unsubscribeDetailB()
      queryClient.clear()
    },
  )

  it('removes catalog data when profile refresh changes the active state', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const blockedStudent = { ...student, status: 'BLOCKED' as const }
    const cachedCourse: StudentCourseDetail = {
      id: 14,
      title: 'Course cached while inactive',
      description: null,
      moduleCount: 0,
      modules: [],
    }
    queryClient.setQueryData(profileQueryKey, blockedStudent)
    queryClient.setQueryData(studentCatalogKeys.detail(14), cachedCourse)
    vi.stubEnv('VITE_API_URL', 'https://api.test')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ data: { user: student } })),
    )

    await queryClient.fetchQuery({ ...profileQueryOptions(), staleTime: 0 })

    expect(queryClient.getQueryData(profileQueryKey)).toEqual(student)
    expect(queryClient.getQueryData(studentCatalogKeys.detail(14))).toBeUndefined()
  })
})
