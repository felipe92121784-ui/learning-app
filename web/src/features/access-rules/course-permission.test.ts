// @vitest-environment jsdom

import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { coursePermissionRules, type CoursePermission } from './course-permission'
import { CoursePermissionToggle } from './course-permission-toggle'

describe('coursePermissionRules', () => {
  it.each([
    ['NONE', 'DENY', 'DENY'],
    ['READ', 'ALLOW', 'DENY'],
    ['FULL', 'ALLOW', 'ALLOW'],
  ] as const)('maps %s to direct VIEW and DOWNLOAD rules', (permission, view, download) => {
    expect(coursePermissionRules(permission as CoursePermission)).toEqual({ view, download })
  })
})

describe('CoursePermissionToggle', () => {
  afterEach(cleanup)

  it('exposes the three localized permission choices as one exclusive radio group', () => {
    render(createElement(CoursePermissionToggle, {
      label: 'Permissão do curso',
      onChange: vi.fn(),
      value: 'READ',
    }))

    expect(screen.getByRole('group', { name: 'Permissão do curso' })).toBeTruthy()
    expect((screen.getByRole('radio', { name: 'Sem acesso' }) as HTMLInputElement).checked).toBe(false)
    expect((screen.getByRole('radio', { name: 'Leitura' }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('radio', { name: 'Total' }) as HTMLInputElement).checked).toBe(false)
  })

  it('reports the newly selected permission through its controlled change handler', () => {
    const onChange = vi.fn()
    render(createElement(CoursePermissionToggle, {
      label: 'Permissão do curso',
      onChange,
      value: 'NONE',
    }))

    fireEvent.click(screen.getByRole('radio', { name: 'Total' }))

    expect(onChange).toHaveBeenCalledWith('FULL')
  })

  it('fills the entire option cell when an option is selected', () => {
    render(createElement(CoursePermissionToggle, {
      label: 'Permissão do curso',
      onChange: vi.fn(),
      value: 'READ',
    }))

    expect(screen.getByText('Leitura').className).toContain('w-full')
  })
})
