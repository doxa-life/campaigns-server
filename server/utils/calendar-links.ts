import { toZonedTime } from 'date-fns-tz'

const DAY_ABBR = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const

export interface CalendarEventOptions {
  title: string
  description: string
  frequency: string
  daysOfWeek?: number[]
  timePreference: string // "HH:MM"
  timezone: string
  durationMinutes: number
}

export function generateRRule(frequency: string, daysOfWeek?: number[]): string {
  if (frequency === 'weekly' && daysOfWeek && daysOfWeek.length > 0) {
    const days = daysOfWeek.map(d => DAY_ABBR[d]).join(',')
    return `RRULE:FREQ=WEEKLY;BYDAY=${days}`
  }
  return 'RRULE:FREQ=DAILY'
}

function getNextStartDate(timePreference: string, timezone: string, frequency: string, daysOfWeek?: number[]): Date {
  const [hours = 0, minutes = 0] = timePreference.split(':').map(Number)
  const nowUtc = new Date()
  const nowLocal = toZonedTime(nowUtc, timezone)

  const candidate = new Date(nowLocal)
  candidate.setHours(hours, minutes, 0, 0)

  if (frequency === 'weekly' && daysOfWeek && daysOfWeek.length > 0) {
    const sortedDays = [...daysOfWeek].sort((a, b) => a - b)
    const currentDay = nowLocal.getDay()

    if (sortedDays.includes(currentDay) && candidate > nowLocal) {
      return candidate
    }

    for (let ahead = 1; ahead <= 7; ahead++) {
      const futureDay = (currentDay + ahead) % 7
      if (sortedDays.includes(futureDay)) {
        const result = new Date(nowLocal)
        result.setDate(result.getDate() + ahead)
        result.setHours(hours, minutes, 0, 0)
        return result
      }
    }
  }

  // Daily: if today's time passed, use tomorrow
  if (candidate <= nowLocal) {
    candidate.setDate(candidate.getDate() + 1)
  }
  return candidate
}

function formatDateLocal(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${y}${m}${d}T${h}${min}00`
}

export function generateGoogleCalendarUrl(options: CalendarEventOptions & { url?: string }): string {
  const { title, description, frequency, daysOfWeek, timePreference, timezone, durationMinutes, url } = options

  const start = getNextStartDate(timePreference, timezone, frequency, daysOfWeek)
  const end = new Date(start)
  end.setMinutes(end.getMinutes() + durationMinutes)

  const startStr = formatDateLocal(start)
  const endStr = formatDateLocal(end)
  const rrule = generateRRule(frequency, daysOfWeek).replace('RRULE:', '')

  const details = url ? `${description}\n\n${url}` : description

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    details,
    dates: `${startStr}/${endStr}`,
    recur: `RRULE:${rrule}`,
    ctz: timezone
  })

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

export function generateIcsContent(options: CalendarEventOptions & { uid: string; url?: string }): string {
  const { title, description, frequency, daysOfWeek, timePreference, timezone, durationMinutes, uid, url } = options

  const start = getNextStartDate(timePreference, timezone, frequency, daysOfWeek)
  const dtstart = formatDateLocal(start)

  const durationH = Math.floor(durationMinutes / 60)
  const durationM = durationMinutes % 60
  const duration = durationH > 0 ? `PT${durationH}H${durationM}M` : `PT${durationM}M`

  const rrule = generateRRule(frequency, daysOfWeek)
  const now = new Date()
  const dtstamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

  const descWithUrl = description.replace(/\n/g, '\\n')

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Doxa//Prayer Reminder//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;TZID=${timezone}:${dtstart}`,
    `DURATION:${duration}`,
    `${rrule}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${descWithUrl}`,
  ]

  if (url) {
    lines.push(`URL:${url}`)
  }

  lines.push('END:VEVENT', 'END:VCALENDAR')

  return lines.join('\r\n')
}

export function getIcsDownloadUrl(subscriptionId: number, profileId: string, baseUrl: string): string {
  return `${baseUrl}/api/calendar/${subscriptionId}?pid=${profileId}`
}
