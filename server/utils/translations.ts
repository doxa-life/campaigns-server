import en from '../../i18n/locales/en/common.json'
import es from '../../i18n/locales/es/common.json'
import fr from '../../i18n/locales/fr/common.json'
import pt from '../../i18n/locales/pt/common.json'
import de from '../../i18n/locales/de/common.json'
import it from '../../i18n/locales/it/common.json'
import zh from '../../i18n/locales/zh/common.json'
import ar from '../../i18n/locales/ar/common.json'
import ru from '../../i18n/locales/ru/common.json'
import hi from '../../i18n/locales/hi/common.json'
import ro from '../../i18n/locales/ro/common.json'

const translations: Record<string, any> = { en, es, fr, pt, de, it, zh, ar, ru, hi, ro }

const SUPPORTED_LOCALES = ['en', 'es', 'fr', 'pt', 'de', 'it', 'zh', 'ar', 'ru', 'hi', 'ro']

/**
 * Get a translation by key path for a given locale.
 * Falls back to English if the key is not found in the requested locale.
 *
 * @param key - Dot-separated key path (e.g., 'email.verification.subject')
 * @param locale - The locale code (e.g., 'en', 'es', 'fr')
 * @param params - Optional parameters to interpolate into the string
 * @returns The translated string, or the key if not found
 *
 * @example
 * t('email.welcome.subject', 'es', { appName: 'Doxa', campaign: 'Test' })
 * // Returns: "Bienvenido a Doxa - Test"
 */
export function t(key: string, locale: string = 'en', params?: Record<string, string | number>): string {
  const normalizedLocale = SUPPORTED_LOCALES.includes(locale) ? locale : 'en'
  const keys = key.split('.')

  // Try to find the value in the requested locale
  let value = translations[normalizedLocale]
  for (const k of keys) {
    value = value?.[k]
    if (value === undefined) break
  }

  // Fall back to English if not found
  if (value === undefined || typeof value !== 'string') {
    value = translations.en
    for (const k of keys) {
      value = value?.[k]
      if (value === undefined) break
    }
  }

  // Return the key if still not found
  if (typeof value !== 'string') {
    return key
  }

  // Interpolate parameters
  if (params) {
    for (const [paramKey, paramValue] of Object.entries(params)) {
      value = value.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue))
    }
  }

  return value
}

/**
 * Check if a locale is supported
 */
export function isLocaleSupported(locale: string): boolean {
  return SUPPORTED_LOCALES.includes(locale)
}

/**
 * Normalize a locale to a supported one, defaulting to 'en'
 */
export function normalizeLocale(locale: string | null | undefined): string {
  if (!locale) return 'en'
  const lower = locale.toLowerCase().split('-')[0] // Handle 'es-ES' -> 'es'
  return SUPPORTED_LOCALES.includes(lower) ? lower : 'en'
}

/**
 * Build a locale-aware URL path.
 * For English (default), returns the path as-is.
 * For other locales, prefixes with the locale code.
 *
 * @param path - The URL path (should start with /)
 * @param locale - The locale code
 * @returns The localized path
 *
 * @example
 * localePath('/zuara/verify', 'en') // '/zuara/verify'
 * localePath('/zuara/verify', 'fr') // '/fr/zuara/verify'
 */
export function localePath(path: string, locale: string = 'en'): string {
  const normalizedLocale = normalizeLocale(locale)
  if (normalizedLocale === 'en') {
    return path
  }
  return `/${normalizedLocale}${path}`
}
