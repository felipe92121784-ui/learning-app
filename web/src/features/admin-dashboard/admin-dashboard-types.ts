export type AdminActivityAction = 'VIEW_MATERIAL' | 'DOWNLOAD_MATERIAL'

export interface AdminDashboard {
  summary: {
    totalCourses: number
    publishedCourses: number
    activeStudents: number
    activeEnrollments: number
    materialActivitiesLast30Days: number
  }
  recentActivities: Array<{
    id: number
    action: AdminActivityAction
    occurredAt: string
    fullName: string
    materialTitle: string
  }>
  topMaterials: Array<{
    materialId: number
    materialTitle: string
    courseTitle: string
    accessCount: number
  }>
}
