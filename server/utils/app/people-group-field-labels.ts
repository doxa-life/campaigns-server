import countries from 'i18n-iso-countries'
import countriesEn from 'i18n-iso-countries/langs/en.json'
import peopleGroupsEn from '../../../i18n/locales/en/people-groups.json'
import languagesEn from '../../../i18n/locales/en/languages.json'
import { getField } from '~/utils/people-group-fields'

countries.registerLocale(countriesEn)

/**
 * A locale file reaches the server as plain JSON from the Nitro build, but as
 * precompiled message ASTs when Vite bundles it (the test runner); static text
 * then sits in body.static.
 */
function messageText(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  const body = (value as { body?: { static?: unknown } } | null)?.body
  return typeof body?.static === 'string' ? body.static : undefined
}

function lookup(path: string): string | undefined {
  let value: any = peopleGroupsEn
  for (const part of path.split('.')) {
    value = value?.[part]
    if (value === undefined) return undefined
  }
  return messageText(value)
}

function humanize(key: string): string {
  return key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
}

/** English label for a people group field key, as the admin UI shows it. */
export function peopleGroupFieldLabel(key: string): string {
  const field = getField(key)
  return (field && lookup(field.labelKey)) || humanize(key)
}

/**
 * English display text for a stored people group field value: option labels
 * for selects, country and language names for codes, Yes/No for booleans,
 * thousands separators for whole numbers. Free text comes back unchanged.
 */
export function peopleGroupFieldDisplay(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  const field = getField(key)

  if (field?.optionsSource === 'countries') {
    return countries.getName(String(value), 'en', { select: 'official' }) || String(value)
  }
  if (key === 'primary_language') {
    return messageText((languagesEn as { languages: Record<string, unknown> }).languages[String(value)]) || String(value)
  }
  if (field?.options) {
    const option = field.options.find((o) => o.value === String(value))
    const label = option?.label || (option?.labelKey ? lookup(option.labelKey) : undefined)
    if (label) return label
  }
  if (typeof value === 'boolean' || value === 'true' || value === 'false') {
    return value === true || value === 'true' ? 'Yes' : 'No'
  }
  if (field?.type === 'number' || typeof value === 'number') {
    const n = Number(value)
    if (Number.isInteger(n)) return n.toLocaleString('en-US')
  }
  return String(value)
}
