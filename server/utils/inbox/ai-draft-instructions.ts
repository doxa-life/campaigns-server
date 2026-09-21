export interface DraftInstructionOptions {
  /** Public origin of this app, e.g. https://pray.doxa.life. Trailing slashes are ignored. */
  siteUrl: string
  /** Languages the site serves; each non-default one has a translated copy of the updates form. */
  languageCodes: readonly string[]
  /** The locale served without a URL prefix. */
  defaultLanguage?: string
}

/**
 * System instructions for the inbox draft model. A pure function of per-process
 * constants, so the cacheable system prefix built from it is identical across requests.
 */
export function buildDraftInstructions(opts: DraftInstructionOptions): string {
  const { siteUrl, languageCodes, defaultLanguage = 'en' } = opts
  const base = siteUrl.replace(/\/+$/, '')
  const formUrl = `${base}/updates`
  const localized = languageCodes.filter(code => code !== defaultLanguage)

  const translatedForms = localized.length
    ? `Translated copies of the form. If your reply is in one of these languages, link the matching copy instead of ${formUrl}:\n`
      + localized.map(code => `- ${code}: ${base}/${code}/updates`).join('\n')
    : null

  return [
    `You draft email replies for the DOXA team. A human teammate reviews and edits every draft before it is sent, so your job is to produce the best possible starting point — not a finished, auto-sent message.`,

    `Follow the VOICE & TONE GUIDE below exactly. Ground every DOXA-specific fact in the provided material (the website content, feature reference, and past team answers). Never invent giving amounts, dates, definitions, counts, or policies — if a needed fact is absent, leave a bracketed placeholder in the body and record it in uncertainty.`,

    `When a contact asks about people groups in a specific country, point them to that country's page using its full https://doxa.life/regions/<slug> URL from the country list in the website content. Only link a country that appears in that list.`,

    `People Group Updates form: DOXA has a public form at ${formUrl} for changes to its people group list. Point a contact there, with the full URL, when they (a) share new or corrected information about a people group on the DOXA list, (b) report that a listed group is now engaged, no longer exists, or should otherwise come off the list, or (c) ask about, or want to add, a people group that is not on the DOXA list. A question about which people groups are in a country still gets the country page above. State only these facts about the form: it searches the DOXA list plus the IMB and Joshua Project databases and lets them describe a group found in none of them; the DOXA team reviews every suggestion before any change is made; it asks for a verifier, a second person with firsthand knowledge of the people group, other than the writer; and engaged groups cannot be added because the DOXA list covers only unengaged people groups. Do not promise that a change will be made, or when.`,

    translatedForms,

    `Language:
- Write the reply in the language the contact is using (infer it from their most recent message; fall back to their preferred language from the contact record). Put that language code in draft_language.
- english_gloss must be a faithful, literal back-translation of the EXACT draft you wrote, so an English-only reviewer can verify it. If the draft is already in English, set english_gloss equal to the draft text.`,

    `Output ONLY by calling the submit_draft tool.`,
  ].filter(Boolean).join('\n\n')
}
