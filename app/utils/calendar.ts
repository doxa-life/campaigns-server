const DAY_ABBR = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const

interface CalendarOptions {
  title: string
  description: string
  frequency: string
  daysOfWeek?: number[]
  timePreference: string
  timezone: string
  durationMinutes: number
  url?: string
}

function formatDateLocal(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${y}${m}${d}T${h}${min}00`
}

function getNextStartDate(timePreference: string, frequency: string, daysOfWeek?: number[]): Date {
  const [hours = 0, minutes = 0] = timePreference.split(':').map(Number)
  const now = new Date()

  const candidate = new Date()
  candidate.setHours(hours, minutes, 0, 0)

  if (frequency === 'weekly' && daysOfWeek && daysOfWeek.length > 0) {
    const sortedDays = [...daysOfWeek].sort((a, b) => a - b)
    const currentDay = now.getDay()

    if (sortedDays.includes(currentDay) && candidate > now) {
      return candidate
    }

    for (let ahead = 1; ahead <= 7; ahead++) {
      const futureDay = (currentDay + ahead) % 7
      if (sortedDays.includes(futureDay)) {
        const result = new Date()
        result.setDate(result.getDate() + ahead)
        result.setHours(hours, minutes, 0, 0)
        return result
      }
    }
  }

  if (candidate <= now) {
    candidate.setDate(candidate.getDate() + 1)
  }
  return candidate
}

export function generateGoogleCalendarUrl(options: CalendarOptions): string {
  const { title, description, frequency, daysOfWeek, timePreference, timezone, durationMinutes, url } = options

  const start = getNextStartDate(timePreference, frequency, daysOfWeek)
  const end = new Date(start)
  end.setMinutes(end.getMinutes() + durationMinutes)

  const startStr = formatDateLocal(start)
  const endStr = formatDateLocal(end)

  let rrule = 'FREQ=DAILY'
  if (frequency === 'weekly' && daysOfWeek && daysOfWeek.length > 0) {
    const days = daysOfWeek.map(d => DAY_ABBR[d]).join(',')
    rrule = `FREQ=WEEKLY;BYDAY=${days}`
  }

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

export function getIcsDownloadUrl(subscriptionId: number, profileId: string): string {
  return `/api/calendar/${subscriptionId}?pid=${profileId}`
}
