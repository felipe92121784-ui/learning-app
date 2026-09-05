import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import {
  createCourse,
  createModule,
  deleteModule,
  getCourse,
  listCourses,
  reorderModules,
  updateCourse,
  updateModule,
} from './courses-api'
import type {
  Course,
  CourseSummary,
  CreateCourseInput,
  CreateModuleInput,
  ReorderModulesInput,
  UpdateCourseInput,
  UpdateModuleInput,
} from './courses-types'

export const coursesQueryKeys = {
  all: ['courses'] as const,
  list: () => ['courses', 'list'] as const,
  detail: (courseId: number) => ['courses', 'detail', courseId] as const,
}

export function coursesQueryOptions() {
  return queryOptions({
    queryKey: coursesQueryKeys.list(),
    queryFn: listCourses,
  })
}

export function courseQueryOptions(courseId: number) {
  return queryOptions({
    queryKey: coursesQueryKeys.detail(courseId),
    queryFn: () => getCourse(courseId),
  })
}

export function useCoursesQuery() {
  return useQuery(coursesQueryOptions())
}

export function useCourseQuery(courseId: number) {
  return useQuery(courseQueryOptions(courseId))
}

function cacheCourseSummary(queryClient: QueryClient, course: CourseSummary) {
  queryClient.setQueryData<Course>(coursesQueryKeys.detail(course.id), (current) =>
    current ? { ...current, ...course } : current,
  )
  queryClient.setQueryData<CourseSummary[]>(coursesQueryKeys.list(), (courses) =>
    courses?.map((currentCourse) =>
      currentCourse.id === course.id ? course : currentCourse,
    ),
  )
}

async function refreshCourseQueries(queryClient: QueryClient, courseId: number) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: coursesQueryKeys.list() }),
    queryClient.invalidateQueries({ queryKey: coursesQueryKeys.detail(courseId) }),
  ])
}

export function useCreateCourseMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateCourseInput) => createCourse(input),
    onSuccess: async (course) => {
      queryClient.setQueryData(coursesQueryKeys.detail(course.id), course)
      queryClient.setQueryData<CourseSummary[]>(coursesQueryKeys.list(), (courses) =>
        courses ? [course, ...courses] : [course],
      )
      await queryClient.invalidateQueries({ queryKey: coursesQueryKeys.list() })
    },
  })
}

interface UpdateCourseVariables {
  courseId: number
  input: UpdateCourseInput
}

export function useUpdateCourseMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ courseId, input }: UpdateCourseVariables) =>
      updateCourse(courseId, input),
    onSuccess: async (course) => {
      cacheCourseSummary(queryClient, course)
      await refreshCourseQueries(queryClient, course.id)
    },
  })
}

interface CreateModuleVariables {
  courseId: number
  input: CreateModuleInput
}

interface UpdateModuleVariables {
  courseId: number
  moduleId: number
  input: UpdateModuleInput
}

interface DeleteModuleVariables {
  courseId: number
  moduleId: number
}

export function useCreateModuleMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ courseId, input }: CreateModuleVariables) =>
      createModule(courseId, input),
    onSuccess: async (_module, { courseId }) => {
      await refreshCourseQueries(queryClient, courseId)
    },
  })
}

export function useUpdateModuleMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ courseId, moduleId, input }: UpdateModuleVariables) =>
      updateModule(courseId, moduleId, input),
    onSuccess: async (_module, { courseId }) => {
      await refreshCourseQueries(queryClient, courseId)
    },
  })
}

export function useDeleteModuleMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ courseId, moduleId }: DeleteModuleVariables) =>
      deleteModule(courseId, moduleId),
    onSuccess: async (_result, { courseId }) => {
      await refreshCourseQueries(queryClient, courseId)
    },
  })
}

export function useReorderModulesMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ courseId, moduleIds }: ReorderModulesInput & { courseId: number }) =>
      reorderModules(courseId, { moduleIds }),
    onSuccess: async (course) => {
      queryClient.setQueryData(coursesQueryKeys.detail(course.id), course)
      await queryClient.invalidateQueries({ queryKey: coursesQueryKeys.all })
    },
  })
}
