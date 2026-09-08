import { describe, expect, it } from 'vitest'
import {
  defaultEnrollmentDates,
  formatEnrollmentDate,
  saoPauloDateRangeToUtc,
} from './enrollment-period'

describe('enrollment period', () => {
  it('defaults an enrollment to today through the same date next year', () => {
    expect(defaultEnrollmentDates(new Date('2026-09-08T12:00:00.000-03:00'))).toEqual({
      startDate: '2026-09-08',
      endDate: '2027-09-08',
    })
  })

  it('converts inclusive Sao Paulo calendar dates to UTC boundaries', () => {
    expect(saoPauloDateRangeToUtc('2026-09-08', '2027-09-08')).toEqual({
      startsAt: '2026-09-08T03:00:00.000Z',
      expiresAt: '2027-09-09T02:59:59.999Z',
    })
  })

  it('rejects an end date before the start date', () => {
    expect(() => saoPauloDateRangeToUtc('2026-09-09', '2026-09-08')).toThrow()
  })

  it('formats an enrollment boundary for administrators in Sao Paulo', () => {
    expect(formatEnrollmentDate('2026-09-08T03:00:00.000Z')).toBe('08/09/2026')
  })
})
