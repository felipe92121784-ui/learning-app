import { apiClient } from '@/lib/api-client'
import type {
  Course,
  CourseModule,
  CourseSummary,
  CreateCourseInput,
  CreateModuleInput,
  ReorderModulesInput,
  UpdateCourseInput,
  UpdateModuleInput,
} from './courses-types'

interface ApiEnvelope<T> {
  data: T
}

function requireData<T>(response: ApiEnvelope<T> | undefined): T {
  if (!response) {
    throw new Error('Courses API returned no data')
  }

  return response.data
}

function jsonRequest(method: 'POST' | 'PATCH' | 'PUT', body: unknown) {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

export async function listCourses(): Promise<CourseSummary[]> {
  return requireData(await apiClient<ApiEnvelope<CourseSummary[]>>('/courses'))
}

export async function getCourse(courseId: number): Promise<Course> {
  return requireData(
    await apiClient<ApiEnvelope<Course>>(`/courses/${courseId}`),
  )
}

export async function createCourse(input: CreateCourseInput): Promise<Course> {
  return requireData(
    await apiClient<ApiEnvelope<Course>>('/courses', jsonRequest('POST', input)),
  )
}

export async function updateCourse(
  courseId: number,
  input: UpdateCourseInput,
): Promise<CourseSummary> {
  return requireData(
    await apiClient<ApiEnvelope<CourseSummary>>(
      `/courses/${courseId}`,
      jsonRequest('PATCH', input),
    ),
  )
}

export async function createModule(
  courseId: number,
  input: CreateModuleInput,
): Promise<CourseModule> {
  return requireData(
    await apiClient<ApiEnvelope<CourseModule>>(
      `/courses/${courseId}/modules`,
      jsonRequest('POST', input),
    ),
  )
}

export async function updateModule(
  courseId: number,
  moduleId: number,
  input: UpdateModuleInput,
): Promise<CourseModule> {
  return requireData(
    await apiClient<ApiEnvelope<CourseModule>>(
      `/courses/${courseId}/modules/${moduleId}`,
      jsonRequest('PATCH', input),
    ),
  )
}

export async function deleteModule(
  courseId: number,
  moduleId: number,
): Promise<void> {
  await apiClient<void>(`/courses/${courseId}/modules/${moduleId}`, {
    method: 'DELETE',
  })
}

export async function reorderModules(
  courseId: number,
  input: ReorderModulesInput,
): Promise<Course> {
  return requireData(
    await apiClient<ApiEnvelope<Course>>(
      `/courses/${courseId}/modules/order`,
      jsonRequest('PUT', input),
    ),
  )
}
