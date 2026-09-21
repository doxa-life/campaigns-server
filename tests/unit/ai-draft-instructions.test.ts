import { describe, it, expect } from 'vitest'
import { buildDraftInstructions } from '../../server/utils/inbox/ai-draft-instructions'

describe('inbox draft instructions', () => {
  const opts = { siteUrl: 'https://pray.doxa.life', languageCodes: ['en', 'es', 'fr'] }

  it('links the People Group Updates form at the site URL', () => {
    const text = buildDraftInstructions(opts)
    expect(text).toContain('People Group Updates form: DOXA has a public form at https://pray.doxa.life/updates')
  })

  it('ignores a trailing slash on the site URL', () => {
    const text = buildDraftInstructions({ ...opts, siteUrl: 'https://pray.doxa.life/' })
    expect(text).toContain('https://pray.doxa.life/updates')
    expect(text).not.toContain('//updates')
  })

  it('lists a translated copy of the form for every non-default language', () => {
    const text = buildDraftInstructions(opts)
    expect(text).toContain('- es: https://pray.doxa.life/es/updates')
    expect(text).toContain('- fr: https://pray.doxa.life/fr/updates')
    expect(text).not.toContain('/en/updates')
  })

  it('omits the translated list when only the default language is enabled', () => {
    const text = buildDraftInstructions({ ...opts, languageCodes: ['en'] })
    expect(text).not.toContain('Translated copies')
    expect(text).not.toContain('undefined')
    expect(text).not.toContain('null')
  })

  it('keeps the country-page rule, places the form rule before the language rules, and ends with the tool call', () => {
    const text = buildDraftInstructions(opts)
    expect(text).toContain('https://doxa.life/regions/<slug>')
    expect(text.indexOf('People Group Updates form')).toBeLessThan(text.indexOf('Language:'))
    expect(text.endsWith('Output ONLY by calling the submit_draft tool.')).toBe(true)
  })
})
