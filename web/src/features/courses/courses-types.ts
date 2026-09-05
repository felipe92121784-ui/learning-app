export const COURSE_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

export type CourseStatus = (typeof COURSE_STATUSES)[number];

export interface CourseModule {
  id: number;
  courseId: number;
  title: string;
  description: string | null;
  position: number;
  createdAt: string;
  updatedAt: string | null;
}

export interface CourseSummary {
  id: number;
  title: string;
  description: string | null;
  status: CourseStatus;
  createdAt: string;
  updatedAt: string | null;
}

export interface Course extends CourseSummary {
  modules: CourseModule[];
}

export interface CreateCourseInput {
  title: string;
  description?: string;
}

export interface UpdateCourseInput {
  title?: string;
  description?: string | null;
  status?: CourseStatus;
}

export interface CreateModuleInput {
  title: string;
  description?: string;
}

export interface UpdateModuleInput {
  title?: string;
  description?: string | null;
}

export interface ReorderModulesInput {
  moduleIds: number[];
}
