/**
 * Redact an email address for display in contexts where the full address should
 * not be exposed (e.g. the mobile app's account screen). Keeps the first
 * character of the local part and the domain label but masks the rest, so the
 * user can recognise which address it is without revealing it in full.
 *
 * `nathan@gospelambition.org` → `n***@g***.org`
 *
 * Malformed input (no `@`) is masked wholesale rather than leaked.
 */
export function redactEmail(email: string): string {
  const value = email?.trim() ?? ''
  const at = value.lastIndexOf('@')
  if (at <= 0 || at === value.length - 1) return '***'

  const local = value.slice(0, at)
  const domain = value.slice(at + 1)

  const redactedLocal = `${local[0]}***${local.slice(at-1, at)}`

  const dot = domain.lastIndexOf('.')
  const redactedDomain =
    dot > 0 ? `${domain[0]}***${domain.slice(dot)}` : `${domain[0]}***`

  return `${redactedLocal}@${redactedDomain}`
}
