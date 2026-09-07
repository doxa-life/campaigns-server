// Re-export language definitions from shared config
export { LANGUAGES, LANGUAGE_CODES, ENABLED_LANGUAGE_CODES, type Language } from '../../config/languages'
import { LANGUAGES, type Language } from '../../config/languages'

export function getLanguageByCode(code: string): Language | undefined {
  return LANGUAGES.find(lang => lang.code === code)
}

export function getLanguageName(code: string): string {
  const language = getLanguageByCode(code)
  return language ? language.name : code
}

export function getLanguageFlag(code: string): string {
  const language = getLanguageByCode(code)
  return language ? language.flag : '🌐'
}

export function getBibleId(code: string): string | undefined {
  const lang = getLanguageByCode(code)
  return lang?.bibleId
}

export function getBibleLabel(code: string): string {
  const lang = getLanguageByCode(code)
  return lang?.bibleLabel || lang?.bibleId || ''
}
