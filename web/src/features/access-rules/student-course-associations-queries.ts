import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { studentCatalogKeys } from '@/features/student-catalog/student-catalog-queries'
import { accessRulesQueryKeys } from './access-rules-queries'
import {
  deleteStudentCourseAssociation,
  listStudentCourseAssociations,
  updateStudentCourseAssociation,
} from './student-course-associations-api'
import type { CoursePermission } from './course-permission'

export const studentCourseAssociationsQueryKeys = {
  all: ['student-course-associations'] as const,
  list: (userId: number) =>
    ['student-course-associations', 'list', userId] as const,
}

export function studentCourseAssociationsQueryOptions(userId: number) {
  return queryOptions({
    queryKey: studentCourseAssociationsQueryKeys.list(userId),
    queryFn: () => listStudentCourseAssociations(userId),
  })
}

export function useStudentCourseAssociationsQuery(userId: number) {
  return useQuery(studentCourseAssociationsQueryOptions(userId))
}

async function refreshAssociatedCourseData(
  queryClient: QueryClient,
  userId: number,
) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: studentCourseAssociationsQueryKeys.list(userId),
    }),
    queryClient.invalidateQueries({ queryKey: accessRulesQueryKeys.all }),
    queryClient.invalidateQueries({ queryKey: studentCatalogKeys.all }),
  ])
}

interface UpdateStudentCourseAssociationVariables {
  userId: number
  courseId: number
  permission: CoursePermission
}

export function useUpdateStudentCourseAssociationMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ userId, courseId, permission }: UpdateStudentCourseAssociationVariables) =>
      updateStudentCourseAssociation(userId, courseId, permission),
    onSuccess: async (_association, { userId }) => {
      await refreshAssociatedCourseData(queryClient, userId)
    },
  })
}

interface DeleteStudentCourseAssociationVariables {
  userId: number
  courseId: number
}

export function useDeleteStudentCourseAssociationMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ userId, courseId }: DeleteStudentCourseAssociationVariables) =>
      deleteStudentCourseAssociation(userId, courseId),
    onSuccess: async (_result, { userId }) => {
      await refreshAssociatedCourseData(queryClient, userId)
    },
  })
}
