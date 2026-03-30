import { allFields, getField } from '../../../app/utils/people-group-fields'
import countries from 'i18n-iso-countries'
import { readFileSync } from 'fs'
import { join } from 'path'

// Register locales for countries
import countriesEn from 'i18n-iso-countries/langs/en.json'
import countriesEs from 'i18n-iso-countries/langs/es.json'
import countriesFr from 'i18n-iso-countries/langs/fr.json'
import countriesPt from 'i18n-iso-countries/langs/pt.json'
import countriesDe from 'i18n-iso-countries/langs/de.json'
import countriesIt from 'i18n-iso-countries/langs/it.json'
import countriesZh from 'i18n-iso-countries/langs/zh.json'
import countriesAr from 'i18n-iso-countries/langs/ar.json'
import countriesRu from 'i18n-iso-countries/langs/ru.json'
import countriesHi from 'i18n-iso-countries/langs/hi.json'

countries.registerLocale(countriesEn)
countries.registerLocale(countriesEs)
countries.registerLocale(countriesFr)
countries.registerLocale(countriesPt)
countries.registerLocale(countriesDe)
countries.registerLocale(countriesIt)
countries.registerLocale(countriesZh)
countries.registerLocale(countriesAr)
countries.registerLocale(countriesRu)
countries.registerLocale(countriesHi)

// Cache for loaded translation files
const translationCache: Record<string, Record<string, any>> = {}

// Load translation files for a locale (merges people-groups.json and languages.json)
function loadTranslations(locale: string): any {
  if (translationCache[locale]) {
    return translationCache[locale]
  }

  const translations: Record<string, any> = {}

  try {
    // Load people-groups.json
    const pgPath = join(process.cwd(), 'i18n', 'locales', locale, 'people-groups.json')
    const pgContent = readFileSync(pgPath, 'utf-8')
    Object.assign(translations, JSON.parse(pgContent))
  } catch {
    // Ignore if file doesn't exist
  }

  try {
    // Load languages.json
    const langPath = join(process.cwd(), 'i18n', 'locales', locale, 'languages.json')
    const langContent = readFileSync(langPath, 'utf-8')
    Object.assign(translations, JSON.parse(langContent))
  } catch {
    // Ignore if file doesn't exist
  }

  // If nothing loaded and not English, fall back to English
  if (Object.keys(translations).length === 0 && locale !== 'en') {
    return loadTranslations('en')
  }

  translationCache[locale] = translations
  return translations
}

export function getFieldOptionLabel(fieldKey: string, optionKey: string, locale: string = 'en'): string | null {
  const field = getField(fieldKey)

  if (!field) {
    return null
  }

  // Handle dynamic options sources (countries use i18n-iso-countries library)
  if (field.optionsSource === 'countries') {
    return countries.getName(optionKey, locale, { select: 'official' }) || optionKey
  }

  // Handle static options with translation support
  if (field.options) {
    const option = field.options.find(o => o.value === optionKey)
    if (option) {
      // If option has a direct label, use it
      if (option.label) {
        return option.label
      }
      // If option has a labelKey, look up the translation
      if (option.labelKey) {
        return getTranslatedLabel(option.labelKey, locale)
      }
    }
  }

  return null
}

// Get translated label from translation files
export function getTranslatedLabel(labelKey: string, locale: string): string {
  const translations = loadTranslations(locale)

  // Parse the labelKey (e.g., 'peopleGroups.options.religion.MSN')
  const parts = labelKey.split('.')

  // Navigate to the value
  let value: any = translations
  for (const part of parts) {
    value = value?.[part]
    if (value === undefined) break
  }

  // If found, return the string; otherwise return the last part of the key
  if (typeof value === 'string') {
    return value
  }

  // Fallback to English if not found in requested locale
  if (locale !== 'en') {
    return getTranslatedLabel(labelKey, 'en')
  }

  // Ultimate fallback: return the option key (last part of labelKey)
  return parts[parts.length - 1] || labelKey
}

// Map field keys to their descriptions key in peopleGroups.options.
// To add descriptions for a new field, add its translation key here and the
// corresponding object in people-groups.json under options.
const FIELD_DESCRIPTION_KEYS: Record<string, string> = {
  imb_reg_of_religion: 'religionDescriptions',
}

/**
 * Returns the long description for a field option when available.
 * Looks up peopleGroups.options.<descriptionKey>[optionKey] from people-groups.json per locale.
 */
export function getFieldOptionDescription(fieldKey: string, optionKey: string, locale: string = 'en'): string | null {
  const descKey = FIELD_DESCRIPTION_KEYS[fieldKey]
  if (!descKey) return null
  const translations = loadTranslations(locale)
  const descriptions = translations?.peopleGroups?.options?.[descKey]
  if (typeof descriptions?.[optionKey] === 'string') return descriptions[optionKey]
  if (locale !== 'en') return getFieldOptionDescription(fieldKey, optionKey, 'en')
  return null
}

/**
 * Returns translated alternate search terms for a field option (e.g., "Muslim" for "Islam - Sunni").
 */
export function getFieldOptionAlternates(fieldKey: string, optionKey: string, locale: string = 'en'): string[] | null {
  const field = getField(fieldKey)
  if (!field?.options) return null
  const option = field.options.find(o => o.value === optionKey)
  if (!option?.alternateKeys?.length) return null
  return option.alternateKeys.map(key => getTranslatedLabel(key, locale))
}

export function getReligionLabel(code: string, locale: string = 'en'): string | null {
  return getFieldOptionLabel('imb_reg_of_religion_3', code, locale)
}

export function getCountryLabel(code: string, locale: string = 'en'): string | null {
  if (!code) return null
  return countries.getName(code, locale, { select: 'official' }) || code
}

// Export all fields for API usage
export { allFields, getField }
