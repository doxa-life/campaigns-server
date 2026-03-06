export function formatDate(d: string) {
  return new Date(d).toLocaleDateString()
}

export function formatDateTime(d: string) {
  return new Date(d).toLocaleString()
}
