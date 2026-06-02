// Hardcoded definition for the May 2026 intercessor survey.
// Shared by the public survey page, the submit/results endpoints, and the
// marketing email template. i18n strings live under `survey.may2026.*` in
// i18n/locales/<lang>/common.json, keyed by question `key`.

export const MAY_2026_SURVEY_KEY = 'may-2026-survey'

export type SurveyQuestionType = 'scale' | 'text' | 'choice'

export interface SurveyQuestion {
  key: string
  type: SurveyQuestionType
  /** For scale questions: the inclusive range rendered as radio options. */
  min?: number
  max?: number
  /** Scale points that have an explanatory label under `questions.<key>.scale.<point>`. */
  scalePoints?: number[]
  /** For choice questions: the ordered option values rendered as radio options.
   *  Each option's label lives under `questions.<key>.options.<value>`; the
   *  selected value is stored in value_int. */
  options?: number[]
}

export const MAY_2026_SURVEY_QUESTIONS: SurveyQuestion[] = [
  { key: 'frequency', type: 'choice', options: [1, 2, 3, 4] },
  { key: 'focus', type: 'scale', min: 1, max: 5, scalePoints: [1, 3, 5] },
  { key: 'experience', type: 'text' },
  { key: 'clarity', type: 'scale', min: 1, max: 5, scalePoints: [1, 3, 5] },
  { key: 'balance', type: 'scale', min: 1, max: 5, scalePoints: [1, 3, 5] },
  { key: 'improvement', type: 'text' }
]

/** Questions whose answer is stored in value_int (scale + choice). */
export const MAY_2026_NUMERIC_KEYS = MAY_2026_SURVEY_QUESTIONS
  .filter(q => q.type === 'scale' || q.type === 'choice')
  .map(q => q.key)

export const MAY_2026_TEXT_KEYS = MAY_2026_SURVEY_QUESTIONS
  .filter(q => q.type === 'text')
  .map(q => q.key)

export function getMay2026Question(key: string): SurveyQuestion | undefined {
  return MAY_2026_SURVEY_QUESTIONS.find(q => q.key === key)
}

/** i18n key helpers (resolve against `survey.may2026.*`). */
export const may2026I18n = {
  questionLabel: (key: string) => `survey.may2026.questions.${key}.label`,
  scaleLabel: (key: string, point: number) => `survey.may2026.questions.${key}.scale.${point}`,
  optionLabel: (key: string, value: number) => `survey.may2026.questions.${key}.options.${value}`
}
