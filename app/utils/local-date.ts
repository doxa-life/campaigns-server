// Calendar dates (YYYY-MM-DD) in the viewer's own timezone.
// `new Date('YYYY-MM-DD')` parses as UTC midnight and `toISOString()` reports
// the UTC date, so both shift the day for anyone not on UTC.

export function parseLocalDate(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year!, month! - 1, day!)
}

export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const date = parseLocalDate(dateKey)
  date.setDate(date.getDate() + days)
  return toLocalDateKey(date)
}
