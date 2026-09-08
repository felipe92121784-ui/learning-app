import { useId } from 'react'
import { cn } from '@/lib/utils'
import { COURSE_PERMISSIONS, type CoursePermission } from './course-permission'

const permissionLabels: Record<CoursePermission, string> = {
  NONE: 'Sem acesso',
  READ: 'Leitura',
  FULL: 'Total',
}

interface CoursePermissionToggleProps {
  label: string
  value: CoursePermission
  onChange: (permission: CoursePermission) => void
  disabled?: boolean
  name?: string
}

export function CoursePermissionToggle({
  label,
  value,
  onChange,
  disabled = false,
  name,
}: CoursePermissionToggleProps) {
  const generatedName = useId()

  return (
    <fieldset className="flex overflow-hidden rounded-md border" disabled={disabled}>
      <legend className="sr-only">{label}</legend>
      {COURSE_PERMISSIONS.map((permission) => (
        <label
          className={cn(
            'relative flex cursor-pointer items-center border-l first:border-l-0',
            disabled && 'cursor-not-allowed opacity-50',
          )}
          key={permission}
        >
          <input
            checked={value === permission}
            className="peer sr-only"
            name={name ?? generatedName}
            onChange={() => onChange(permission)}
            type="radio"
            value={permission}
          />
          <span className="px-3 py-2 text-sm font-medium peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-checked:bg-primary peer-checked:text-primary-foreground">
            {permissionLabels[permission]}
          </span>
        </label>
      ))}
    </fieldset>
  )
}
