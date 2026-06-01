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

import { getSubscriberFieldLabel } from './subscriber-fields'
import { getGroupFieldLabel } from './group-fields'
import countries from 'i18n-iso-countries'
import countriesEn from 'i18n-iso-countries/langs/en.json'
countries.registerLocale(countriesEn)

export function formatFormKey(key: string): string {
  const subscriberLabel = getSubscriberFieldLabel(key)
  if (subscriberLabel !== key) return subscriberLabel

  const groupLabel = getGroupFieldLabel(key)
  if (groupLabel !== key) return groupLabel

  return key
}

export function formatFormValue(value: any, key?: string): string {
  if (value === null || value === undefined || value === '') return '(empty)'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (key === 'country' && value) {
    return countries.getName(String(value), 'en', { select: 'official' }) || String(value)
  }
  return String(value)
}
