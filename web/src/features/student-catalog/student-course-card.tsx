import { Link } from '@tanstack/react-router'
import { BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { StudentCourseSummary } from './student-catalog-types'

interface StudentCourseCardProps {
  course: StudentCourseSummary
}

export function StudentCourseCard({ course }: StudentCourseCardProps) {
  const moduleCount = `${course.moduleCount} ${course.moduleCount === 1 ? 'módulo' : 'módulos'}`

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-muted p-2 text-muted-foreground">
            <BookOpen aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 space-y-2">
            <CardTitle>
              <h2 className="text-lg leading-snug">{course.title}</h2>
            </CardTitle>
            <CardDescription>
              {course.description ?? 'Sem descrição disponível.'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="mt-auto flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">{moduleCount}</span>
        <Button asChild size="sm" variant="outline">
          <Link
            params={{ courseId: String(course.id) }}
            to="/app/courses/$courseId"
          >
            Abrir curso
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
