import { surveyService, type SurveyTranslationContent } from '#server/database/surveys'
import { isDeepLConfigured, SUPPORTED_LANGUAGES, translateTexts, translateTiptapContent } from '#server/utils/deepl'

// Interpolation tokens (e.g. {name}) must survive translation untouched. Swap them
// for a private-use unicode sentinel that DeepL passes through verbatim.
const TOKEN = /\{name\}/g
const SENTINEL = ''
const protect = (s: string) => s.replace(TOKEN, SENTINEL)
const restore = (s: string) => s.replace(new RegExp(SENTINEL, 'g'), '{name}')

/**
 * Flatten the translatable plain strings of a content blob into an ordered list
 * plus setter closures, so a parallel-position translated array can be reassembled
 * back into the same shape. The email `body` (Tiptap) is translated separately.
 */
function collectPlainStrings(content: SurveyTranslationContent) {
  const out: SurveyTranslationContent = { page: {}, questions: {}, email: {} }
  const texts: string[] = []
  const setters: Array<(v: string) => void> = []

  const add = (value: string, set: (v: string) => void) => {
    texts.push(protect(value))
    setters.push(set)
  }

  for (const [k, v] of Object.entries(content.page ?? {})) {
    if (typeof v === 'string') add(v, (val) => { out.page![k] = val })
  }

  for (const [qKey, q] of Object.entries(content.questions ?? {})) {
    out.questions![qKey] = {}
    if (typeof q?.label === 'string') add(q.label, (val) => { out.questions![qKey]!.label = val })
    if (q?.scale) {
      out.questions![qKey]!.scale = {}
      for (const [point, label] of Object.entries(q.scale)) {
        if (typeof label === 'string') add(label, (val) => { out.questions![qKey]!.scale![point] = val })
      }
    }
  }

  const emailFields = ['subject', 'header', 'greeting', 'greeting_fallback', 'cta', 'signoff', 'team'] as const
  for (const field of emailFields) {
    const v = content.email?.[field]
    if (typeof v === 'string') add(v, (val) => { (out.email as any)[field] = val })
  }

  return {
    texts,
    apply(translated: string[]): SurveyTranslationContent {
      setters.forEach((set, i) => set(restore(translated[i] ?? texts[i] ?? '')))
      return out
    }
  }
}

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'content.create')

  if (!isDeepLConfigured()) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Translation service not configured. Please add DEEPL_API_KEY to environment.'
    })
  }

  const key = getRouterParam(event, 'key')
  if (!key) {
    throw createError({ statusCode: 400, statusMessage: 'Missing survey key' })
  }

  const survey = await surveyService.getByKey(key)
  if (!survey) {
    throw createError({ statusCode: 404, statusMessage: 'Survey not found' })
  }

  const body = await readBody(event)
  const sourceLanguage = typeof body?.source_language === 'string' && body.source_language ? body.source_language : 'en'

  const all = await surveyService.getAllTranslations(survey.id)
  const source = all[sourceLanguage]
  if (!source) {
    throw createError({ statusCode: 400, statusMessage: `No content for source language: ${sourceLanguage}` })
  }

  const allTargets = SUPPORTED_LANGUAGES.filter(l => l !== sourceLanguage)
  const requested = Array.isArray(body?.target_languages) ? (body.target_languages as string[]) : null
  const targets = requested
    ? requested.filter(l => allTargets.includes(l))
    : allTargets

  const translated: string[] = []
  const failed: Array<{ language: string; error: string }> = []

  await Promise.all(targets.map(async (target) => {
    try {
      const { texts, apply } = collectPlainStrings(source)
      const translatedTexts = texts.length ? await translateTexts(texts, target, sourceLanguage) : []
      const content = apply(translatedTexts)

      if (source.email?.body) {
        const { doc } = await translateTiptapContent(source.email.body as any, target, sourceLanguage)
        content.email = { ...content.email, body: doc as any }
      }

      await surveyService.upsertTranslation(survey.id, target, content)
      translated.push(target)
    } catch (err: any) {
      console.error(`[survey translate] ${survey.key} → ${target} failed:`, err)
      failed.push({ language: target, error: err?.message || 'translation failed' })
    }
  }))

  logUpdate('surveys', String(survey.id), event, { changes: { translated, failed: failed.map(f => f.language) } })

  return { success: failed.length === 0, translated, failed }
})
