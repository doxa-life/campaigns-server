import { describe, it, expect } from 'vitest'
import { matchesLanguage } from '../../server/utils/bolls-languages'

// Names as bolls.life actually publishes them.
const CATALOG = [
  'Arabic العربية',
  'Chinese 中文',
  'Finnish Suomi',
  'French Français',
  'German Deutsch',
  'Hindi हिन्दी',
  'Latin / Italian',
  'Portuguese',
  'Romanian Română',
  'russian русский',
  'Spanish Español',
  'Tamil தமிழ்'
]

function findFor(languageNameEn: string): string | undefined {
  return CATALOG.find(name => matchesLanguage(name, languageNameEn))
}

describe('matchesLanguage', () => {
  it('matches a name paired with its endonym', () => {
    expect(findFor('Romanian')).toBe('Romanian Română')
    expect(findFor('Finnish')).toBe('Finnish Suomi')
    expect(findFor('Chinese')).toBe('Chinese 中文')
    expect(findFor('Tamil')).toBe('Tamil தமிழ்')
  })

  it('ignores the catalog’s inconsistent capitalisation', () => {
    expect(findFor('Russian')).toBe('russian русский')
  })

  it('matches a language sharing an entry with another', () => {
    expect(findFor('Italian')).toBe('Latin / Italian')
  })

  it('matches a name with no endonym', () => {
    expect(findFor('Portuguese')).toBe('Portuguese')
  })

  it('matches a multi-word name against the entry it starts', () => {
    expect(matchesLanguage('Simplified Chinese 简体', 'Simplified Chinese')).toBe(true)
  })

  it('finds nothing for a language the catalog does not carry', () => {
    expect(findFor('Sinhala')).toBeUndefined()
  })

  it('does not match on a shared word fragment', () => {
    expect(matchesLanguage('Romanian Română', 'Roman')).toBe(false)
    expect(matchesLanguage('Greek Ελληνικά', '')).toBe(false)
  })
})
