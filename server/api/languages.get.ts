import { LANGUAGES } from '../../config/languages'

/**
 * GET /api/languages — every language in config/languages.ts, switched off ones
 * included, so other DOXA surfaces read Bible editions from here instead of copying them.
 */
export default defineEventHandler(() => ({
  languages: LANGUAGES.map(language => ({
    code: language.code,
    name: language.name,
    native_name: language.nativeName,
    text_direction: language.dir || 'ltr',
    bible_id: language.bibleId || null,
    bible_label: language.bibleLabel || language.bibleId || null,
    enabled: language.enabled !== false
  }))
}))
