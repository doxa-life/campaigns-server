import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import { appConfigService } from '../database/app-config'

export interface NextReminderOptions {
  timezone: string          // IANA timezone (e.g., "America/New_York")
  timePreference: string    // "HH:MM" format (e.g., "09:00")
  frequency: string         // "daily" or "weekly"
  daysOfWeek?: number[]     // For weekly: array of days (0=Sunday, 1=Monday, etc.)
}

/**
 * Calculate the next reminder time in UTC based on user's timezone and preferences.
 * Ensures the reminder is never scheduled before the global start date.
 *
 * @param options - The user's reminder preferences
 * @returns Date object representing the next reminder time in UTC
 */
export async function calculateNextReminderUtc(options: NextReminderOptions): Promise<Date> {
  const { timezone, timePreference, frequency, daysOfWeek } = options

  // Parse time preference
  const [hours = 0, minutes = 0] = timePreference.split(':').map(Number)

  // Get current time in user's timezone
  const nowUtc = new Date()
  const nowInUserTz = toZonedTime(nowUtc, timezone)

  // Get global start date and convert to user's timezone
  const globalStartDate = await appConfigService.getConfig<string>('global_campaign_start_date')
  let minDateInUserTz: Date | null = null
  if (globalStartDate) {
    // Parse as local date components to avoid timezone issues
    const [year, month, day] = globalStartDate.split('-').map(Number)
    // Create the start date at the user's preferred time in their timezone
    minDateInUserTz = new Date(year!, month! - 1, day!)
    minDateInUserTz.setHours(hours, minutes, 0, 0)
  }

  // Start with today in user's timezone
  let candidateDate = new Date(nowInUserTz)
  candidateDate.setHours(hours, minutes, 0, 0)

  if (frequency === 'daily') {
    // For daily: if today's time has passed, move to tomorrow
    if (candidateDate <= nowInUserTz) {
      candidateDate.setDate(candidateDate.getDate() + 1)
    }
  } else if (frequency === 'weekly' && daysOfWeek && daysOfWeek.length > 0) {
    // For weekly: find the next matching day
    candidateDate = findNextMatchingDay(nowInUserTz, hours, minutes, daysOfWeek)
  }

  // Ensure candidate is not before the global start date (in user's timezone)
  if (minDateInUserTz && candidateDate < minDateInUserTz) {
    if (frequency === 'daily') {
      // For daily: use the start date at their preferred time
      candidateDate = minDateInUserTz
    } else if (frequency === 'weekly' && daysOfWeek && daysOfWeek.length > 0) {
      // For weekly: find the first matching day on or after the start date
      candidateDate = findNextMatchingDayFrom(minDateInUserTz, hours, minutes, daysOfWeek)
    }
  }

  // Convert back to UTC
  return fromZonedTime(candidateDate, timezone)
}

/**
 * Find the next date that matches one of the specified days of the week.
 */
function findNextMatchingDay(
  nowInUserTz: Date,
  hours: number,
  minutes: number,
  daysOfWeek: number[]
): Date {
  // Sort days for consistent iteration
  const sortedDays = [...daysOfWeek].sort((a, b) => a - b)
  const currentDay = nowInUserTz.getDay()

  // Create a candidate for today at the specified time
  const todayCandidate = new Date(nowInUserTz)
  todayCandidate.setHours(hours, minutes, 0, 0)

  // Check if today is a valid day and time hasn't passed
  if (sortedDays.includes(currentDay) && todayCandidate > nowInUserTz) {
    return todayCandidate
  }

  // Find the next valid day
  for (let daysAhead = 1; daysAhead <= 7; daysAhead++) {
    const futureDay = (currentDay + daysAhead) % 7
    if (sortedDays.includes(futureDay)) {
      const result = new Date(nowInUserTz)
      result.setDate(result.getDate() + daysAhead)
      result.setHours(hours, minutes, 0, 0)
      return result
    }
  }

  // Fallback: shouldn't reach here if daysOfWeek is valid
  const fallback = new Date(nowInUserTz)
  fallback.setDate(fallback.getDate() + 1)
  fallback.setHours(hours, minutes, 0, 0)
  return fallback
}

/**
 * Find the first matching day of the week on or after a given start date.
 */
function findNextMatchingDayFrom(
  startDate: Date,
  hours: number,
  minutes: number,
  daysOfWeek: number[]
): Date {
  const sortedDays = [...daysOfWeek].sort((a, b) => a - b)
  const startDay = startDate.getDay()

  // Check if start date itself is a valid day
  if (sortedDays.includes(startDay)) {
    return startDate
  }

  // Find the next valid day from start date
  for (let daysAhead = 1; daysAhead <= 7; daysAhead++) {
    const futureDay = (startDay + daysAhead) % 7
    if (sortedDays.includes(futureDay)) {
      const result = new Date(startDate)
      result.setDate(result.getDate() + daysAhead)
      result.setHours(hours, minutes, 0, 0)
      return result
    }
  }

  // Fallback: shouldn't reach here if daysOfWeek is valid
  return startDate
}

/**
 * Calculate the next reminder after a specific date (used after sending a reminder).
 * This ensures we always move forward in time.
 */
export function calculateNextReminderAfterSend(options: NextReminderOptions): Date {
  const { timezone, timePreference, frequency, daysOfWeek } = options

  // Parse time preference
  const [hours = 0, minutes = 0] = timePreference.split(':').map(Number)

  // Get current time in user's timezone
  const nowUtc = new Date()
  const nowInUserTz = toZonedTime(nowUtc, timezone)

  if (frequency === 'daily') {
    // For daily: always schedule for tomorrow
    const tomorrow = new Date(nowInUserTz)
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(hours, minutes, 0, 0)
    return fromZonedTime(tomorrow, timezone)
  } else if (frequency === 'weekly' && daysOfWeek && daysOfWeek.length > 0) {
    // For weekly: find the next matching day (excluding today since we just sent)
    const sortedDays = [...daysOfWeek].sort((a, b) => a - b)
    const currentDay = nowInUserTz.getDay()

    for (let daysAhead = 1; daysAhead <= 7; daysAhead++) {
      const futureDay = (currentDay + daysAhead) % 7
      if (sortedDays.includes(futureDay)) {
        const result = new Date(nowInUserTz)
        result.setDate(result.getDate() + daysAhead)
        result.setHours(hours, minutes, 0, 0)
        return fromZonedTime(result, timezone)
      }
    }
  }

  // Fallback: tomorrow at the same time
  const fallback = new Date(nowInUserTz)
  fallback.setDate(fallback.getDate() + 1)
  fallback.setHours(hours, minutes, 0, 0)
  return fromZonedTime(fallback, timezone)
}

/**
 * Validate that a timezone string is valid.
 */
export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone })
    return true
  } catch {
    return false
  }
}
