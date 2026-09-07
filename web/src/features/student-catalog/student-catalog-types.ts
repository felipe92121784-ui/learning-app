export type StudentModuleAvailability = 'AVAILABLE' | 'LOCKED'
export type StudentMaterialAvailability =
  | 'AVAILABLE'
  | 'LOCKED'
  | 'UNAVAILABLE'
export type StudentMaterialType = 'PDF' | 'IMAGE' | 'ZIP'
export type StudentUnavailableReason = 'PROCESSING' | 'FAILED'

export interface StudentCourseSummary {
  id: number
  title: string
  description: string | null
  moduleCount: number
}

export interface StudentMaterial {
  id: number
  title: string
  description: string | null
  type: StudentMaterialType
  availability: StudentMaterialAvailability
  unavailableReason?: StudentUnavailableReason
}

export interface StudentCourseModule {
  id: number
  title: string
  description: string | null
  availability: StudentModuleAvailability
  materials: StudentMaterial[]
}

export interface StudentCourseDetail extends StudentCourseSummary {
  modules: StudentCourseModule[]
}
