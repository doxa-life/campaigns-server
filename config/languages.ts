// Single source of truth for language configuration
// Used by both nuxt.config.ts (i18n) and app/server code

export interface Language {
  code: string
  name: string           // English name
  nativeName: string     // Name in the language itself
  flag: string
  dir?: 'ltr' | 'rtl'    // Text direction (defaults to 'ltr')
  deeplTarget: string    // DeepL target language code
  deeplSource: string    // DeepL source language code (sometimes different)
  bibleId?: string       // Bolls.life translation ID for verse lookups
  bibleLabel?: string    // Display label for the Bible translation (defaults to bibleId)
  glossaryId?: string    // DeepL glossary ID for this language pair (EN → target)
  enabled?: boolean      // Whether the language is active in the UI (default: true)
}

// All known languages — disabled languages are available for API responses
// but hidden from the UI language selector, translation targets, and admin content
// find translations: https://bolls.life/static/bolls/app/views/languages.json
export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸', deeplTarget: 'EN', deeplSource: 'EN', bibleId: 'NKJV' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸', deeplTarget: 'ES', deeplSource: 'ES', bibleId: 'NVI', glossaryId: 'b867e526-2eb8-426f-a178-b8a6b9d4d6ce' }, //RV1960
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷', deeplTarget: 'FR', deeplSource: 'FR', bibleId: 'FRLSG', bibleLabel: 'LSG', glossaryId: 'b6dd3213-1ddb-42ab-a2dc-91ff3a772fa3' }, //maybe BDS
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹', deeplTarget: 'PT-BR', deeplSource: 'PT', bibleId: 'NAA', glossaryId: 'bbe0697f-429a-45f7-9c30-576c7f21c78d' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪', deeplTarget: 'DE', deeplSource: 'DE', bibleId: 'S00', bibleLabel: 'SCH2000', glossaryId: '87ad31eb-1a58-4f91-b80e-943b3721065d', enabled: false },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹', deeplTarget: 'IT', deeplSource: 'IT', bibleId: 'NR06', glossaryId: '98dca739-468a-4c29-a0ce-ba89f60da00b', enabled: false },
  { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳', deeplTarget: 'ZH-HANS', deeplSource: 'ZH', bibleId: 'CUNPS', glossaryId: '532adee9-5117-4a9e-a6cb-a8c4b670232d', enabled: false },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦', dir: 'rtl', deeplTarget: 'AR', deeplSource: 'AR', bibleId: 'SVD', glossaryId: '294b6001-2831-45d4-bab5-3fd1af92dc7a' }, // NAV (New Arabic Version) would be better but not on Bolls
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺', deeplTarget: 'RU', deeplSource: 'RU', bibleId: 'SYNOD', glossaryId: '7363b815-3cd1-4e1a-ae8b-d6695e6dbc4a' }, // NRT (New Russian Translation) is a modern alternative
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳', deeplTarget: 'HI', deeplSource: 'HI', bibleId: 'HIOV', bibleLabel: 'OV', enabled: false },
  { code: 'ro', name: 'Romanian', nativeName: 'Română', flag: '🇷🇴', deeplTarget: 'RO', deeplSource: 'RO', bibleId: 'NTR', glossaryId: 'e50d3fed-6d0e-4f2c-a3ac-96112829055e', enabled: false },
]

// All language codes
export const LANGUAGE_CODES = LANGUAGES.map(lang => lang.code)

// Enabled languages — used for front-end language switcher and i18n locales
export const ENABLED_LANGUAGES = LANGUAGES.filter(lang => lang.enabled !== false)
export const ENABLED_LANGUAGE_CODES = ENABLED_LANGUAGES.map(lang => lang.code)

// Generate i18n locale config from enabled languages only
export function generateI18nLocales() {
  return ENABLED_LANGUAGES.map(lang => ({
    code: lang.code,
    name: lang.nativeName,
    ...(lang.dir && { dir: lang.dir }),
    files: [
      `${lang.code}/common.json`,
      `${lang.code}/people-groups.json`,
      `${lang.code}/languages.json`
    ]
  }))
}
