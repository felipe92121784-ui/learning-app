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
  value: CoursePermission | null
  onChange: (permission: CoursePermission) => void
  disabled?: boolean
  name?: string
  options?: readonly CoursePermission[]
  labels?: Partial<Record<CoursePermission, string>>
}

export function CoursePermissionToggle({
  label,
  value,
  onChange,
  disabled = false,
  name,
  options = COURSE_PERMISSIONS,
  labels,
}: CoursePermissionToggleProps) {
  const generatedName = useId()

  return (
    <fieldset className="flex w-full overflow-hidden rounded-md border sm:w-auto" disabled={disabled}>
      <legend className="sr-only">{label}</legend>
      {options.map((permission) => (
        <label
          className={cn(
            'relative flex min-w-[5.5rem] flex-1 cursor-pointer items-center justify-center border-l first:border-l-0',
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
          <span className="flex min-h-11 w-full items-center justify-center px-2 py-2 text-center text-sm leading-tight font-medium whitespace-nowrap peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-checked:bg-primary peer-checked:text-primary-foreground sm:px-3">
            {labels?.[permission] ?? permissionLabels[permission]}
          </span>
        </label>
      ))}
    </fieldset>
  )
}
