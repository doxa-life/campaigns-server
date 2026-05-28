import { t } from './translations'
import { MAY_2026_SURVEY_KEY } from '#shared/surveys/may-2026-survey'

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

// Personalized greeting, falling back to a generic one when we have no usable name.
function greeting(locale: string, name?: string): string {
  const clean = name?.trim()
  if (clean && clean.toLowerCase() !== 'anonymous') {
    return t('survey.may2026.email.greeting', locale, { name: clean })
  }
  return t('survey.may2026.email.greetingFallback', locale)
}

const may2026Survey: MarketingTemplate = {
  key: MAY_2026_SURVEY_KEY,
  label: 'May 2026 Survey',
  getSubject: locale => t('survey.may2026.email.subject', locale),
  getHeader: locale => t('survey.may2026.email.header', locale),
  renderContentHtml: (locale, { surveyUrl, name }) => {
    const cta = t('survey.may2026.email.cta', locale)
    const button = `<div style="text-align: center; margin: 32px 0;">`
      + `<a href="${surveyUrl}" style="display: inline-block; background: #3B463D; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-size: 16px; font-weight: 600;">${cta}</a>`
      + `</div>`
    return [
      para(greeting(locale, name)),
      para(t('survey.may2026.email.p1', locale)),
      para(t('survey.may2026.email.p2', locale)),
      para(t('survey.may2026.email.p3', locale)),
      button,
      para(`${t('survey.may2026.email.signoff', locale)}<br/>${t('survey.may2026.email.team', locale)}`)
    ].join('')
  },
  renderText: (locale, { surveyUrl, name }) => [
    greeting(locale, name),
    '',
    t('survey.may2026.email.p1', locale),
    '',
    t('survey.may2026.email.p2', locale),
    '',
    t('survey.may2026.email.p3', locale),
    '',
    `${t('survey.may2026.email.cta', locale)}: ${surveyUrl}`,
    '',
    t('survey.may2026.email.signoff', locale),
    t('survey.may2026.email.team', locale)
  ].join('\n')
}

export const MARKETING_TEMPLATES: Record<string, MarketingTemplate> = {
  [MAY_2026_SURVEY_KEY]: may2026Survey
}

/** Returns null for the implicit 'default' template (admin-authored content). */
export function getMarketingTemplate(key?: string | null): MarketingTemplate | null {
  if (!key || key === 'default') return null
  return MARKETING_TEMPLATES[key] ?? null
}

export function isValidTemplateKey(key: string): boolean {
  return key === 'default' || key in MARKETING_TEMPLATES
}

export function listMarketingTemplates(locale: string = 'en'): Array<{ key: string; label: string; subject?: string }> {
  return [
    { key: 'default', label: 'Default (write your own)' },
    ...Object.values(MARKETING_TEMPLATES).map(tpl => ({
      key: tpl.key,
      label: tpl.label,
      subject: tpl.getSubject(locale)
    }))
  ]
}
