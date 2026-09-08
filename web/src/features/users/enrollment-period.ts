export interface EnrollmentPeriodInput {
  startsAt: string
  expiresAt: string
}

export type EnrollmentStatus = 'SCHEDULED' | 'ACTIVE' | 'EXPIRED'

interface EnrollmentDates {
  startDate: string
  endDate: string
}

export function defaultEnrollmentDates(now: Date): EnrollmentDates {
  const startDate = saoPauloCalendarDate(now)
  const [year, month, day] = startDate.split('-').map(Number)
  const endYear = year + 1
  const endDay = Math.min(day, lastDayOfMonth(endYear, month))
  const endDate = formatCalendarDate(new Date(Date.UTC(endYear, month - 1, endDay)))

  return { startDate, endDate }
}

export function saoPauloDateRangeToUtc(
  startDate: string,
  endDate: string,
): EnrollmentPeriodInput {
  const startsAt = parseSaoPauloBoundary(startDate, 'T00:00:00.000-03:00')
  const expiresAt = parseSaoPauloBoundary(endDate, 'T23:59:59.999-03:00')

  if (expiresAt.getTime() <= startsAt.getTime()) {
    throw new Error('Enrollment end date must not be before its start date')
  }

  return {
    startsAt: startsAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  }
}

export function formatEnrollmentDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso))
}

function saoPauloCalendarDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )

  return `${values.year}-${values.month}-${values.day}`
}

function formatCalendarDate(date: Date): string {
  return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()]
    .map((part, index) => index === 0 ? String(part) : String(part).padStart(2, '0'))
    .join('-')
}

function parseSaoPauloBoundary(date: string, boundary: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Enrollment dates must use the YYYY-MM-DD format')
  }

  const [year, month, day] = date.split('-').map(Number)
  if (day > lastDayOfMonth(year, month)) {
    throw new Error('Enrollment dates must be valid calendar dates')
  }

  const parsed = new Date(`${date}${boundary}`)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Enrollment dates must be valid calendar dates')
  }

  return parsed
}

function lastDayOfMonth(year: number, month: number): number {
  if (month < 1 || month > 12) return 0

  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}
