import { surveyService, type SurveyTranslationContent } from '#server/database/surveys'
import { tiptapToHtml, tiptapToText } from './marketing-email-template'

export interface MarketingTemplateVars {
  surveyUrl: string
  name?: string
}

export interface MarketingTemplate {
  key: string
  label: string
  getSubject: (locale: string) => string
  getHeader: (locale: string) => string
  renderContentHtml: (locale: string, vars: MarketingTemplateVars) => string
  renderText: (locale: string, vars: MarketingTemplateVars) => string
}

function para(html: string): string {
  return `<p style="margin: 16px 0; font-size: 16px; line-height: 1.6; color: #3B463D;">${html}</p>`
}

// Personalized greeting, falling back to the generic one when there's no usable name.
function greetingLine(email: NonNullable<SurveyTranslationContent['email']>, name?: string): string {
  const clean = name?.trim()
  if (clean && clean.toLowerCase() !== 'anonymous' && email.greeting) {
    return email.greeting.replace(/\{name\}/g, clean)
  }
  return email.greeting_fallback || email.greeting?.replace(/\{name\}/g, '').replace(/\s+/g, ' ').trim() || ''
}

/**
 * Build a marketing template backed by a survey's per-language content. Render
 * methods are synchronous and close over the already-loaded translations, so the
 * send processor can call them per-recipient without extra DB round-trips.
 */
function buildSurveyTemplate(
  survey: { key: string; title: string },
  translations: Record<string, SurveyTranslationContent>
): MarketingTemplate {
  const contentFor = (locale: string): SurveyTranslationContent =>
    translations[locale] ?? translations.en ?? {}
  const emailFor = (locale: string) => contentFor(locale).email ?? {}

  return {
    key: survey.key,
    label: survey.title,
    getSubject: locale => emailFor(locale).subject || survey.title,
    getHeader: locale => emailFor(locale).header || '',
    renderContentHtml: (locale, { surveyUrl, name }) => {
      const email = emailFor(locale)
      const cta = email.cta || 'Open'
      const button = `<div style="text-align: center; margin: 32px 0;">`
        + `<a href="${surveyUrl}" style="display: inline-block; background: #3B463D; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-size: 16px; font-weight: 600;">${cta}</a>`
        + `</div>`
      const parts = [para(greetingLine(email, name))]
      const bodyHtml = email.body ? tiptapToHtml(email.body) : ''
      if (bodyHtml) parts.push(bodyHtml)
      parts.push(button)
      if (email.signoff || email.team) {
        parts.push(para(`${email.signoff ?? ''}${email.signoff && email.team ? '<br/>' : ''}${email.team ?? ''}`))
      }
      return parts.join('')
    },
    renderText: (locale, { surveyUrl, name }) => {
      const email = emailFor(locale)
      const lines = [greetingLine(email, name), '']
      const bodyText = email.body ? tiptapToText(email.body) : ''
      if (bodyText) lines.push(bodyText, '')
      lines.push(`${email.cta || 'Open'}: ${surveyUrl}`, '')
      if (email.signoff) lines.push(email.signoff)
      if (email.team) lines.push(email.team)
      return lines.join('\n')
    }
  }
}

/**
 * Resolve a marketing email's template. Returns null for the implicit 'default'
 * template (admin-authored content). Any other key is treated as a survey key and
 * rendered from that survey's DB-stored, per-language email content.
 */
export async function getMarketingTemplate(key?: string | null): Promise<MarketingTemplate | null> {
  if (!key || key === 'default') return null
  const survey = await surveyService.getByKey(key)
  if (!survey) return null
  const translations = await surveyService.getAllTranslations(survey.id)
  return buildSurveyTemplate(survey, translations)
}

export async function isValidTemplateKey(key: string): Promise<boolean> {
  if (key === 'default') return true
  return (await surveyService.getByKey(key)) !== null
}

/**
 * 'default' plus every open survey, each exposing its localized subject so the
 * marketing-email composer can list them as predefined templates.
 */
export async function listMarketingTemplates(
  locale: string = 'en'
): Promise<Array<{ key: string; label: string; subject?: string }>> {
  const surveys = await surveyService.listWithResponseCounts()
  const templates: Array<{ key: string; label: string; subject?: string }> = [
    { key: 'default', label: 'Default (write your own)' }
  ]
  for (const survey of surveys) {
    if (survey.status !== 'open') continue
    const content = await surveyService.getTranslation(survey.id, locale)
    templates.push({
      key: survey.key,
      label: survey.title,
      subject: content.email?.subject || survey.title
    })
  }
  return templates
}
