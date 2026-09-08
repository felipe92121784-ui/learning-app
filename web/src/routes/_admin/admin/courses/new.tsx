/* eslint-disable react/only-export-components */
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { CreateCourseDrawer } from '@/features/courses/create-course-drawer'

export const Route = createFileRoute('/_admin/admin/courses/new')({
  component: NewCoursePage,
})

function NewCoursePage() {
  const navigate = useNavigate()
  return (
    <CreateCourseDrawer
      open
      onOpenChange={(open) => {
        if (!open) void navigate({ to: '/admin/courses' })
      }}
    />
  )
}
