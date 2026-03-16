export function formatDate(d: string) {
  return new Date(d).toLocaleDateString()
}

export function formatDateTime(d: string) {
  return new Date(d).toLocaleString()
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remaining = Math.round(minutes % 60)
  if (remaining === 0) return `${hours.toLocaleString()}h`
  return `${hours.toLocaleString()}h ${remaining}m`
}
