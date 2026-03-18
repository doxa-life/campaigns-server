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

const FORM_KEY_LABELS: Record<string, string> = {
  people_group: 'People Group',
  email: 'Email',
  phone: 'Phone',
  church: 'Church',
  role: 'Role',
  country: 'Country',
  language: 'Language',
  public_display: 'Public Display',
  permission_to_contact: 'Permission to Contact'
}

export function formatFormKey(key: string): string {
  return FORM_KEY_LABELS[key] || key.replace(/_/g, ' ')
}

export function formatFormValue(value: any): string {
  if (value === null || value === undefined || value === '') return '(empty)'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}
