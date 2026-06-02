import type { Fragment } from 'postgres'
import { getSql } from './db'
import { buildSet } from './sql-helpers'

export type SurveyQuestionType = 'scale' | 'text'

export interface SurveyQuestionConfig {
  /** Scale questions: inclusive range rendered as radio options. */
  min?: number
  max?: number
  /** Scale points that carry an explanatory label in the translation blob. */
  scalePoints?: number[]
}

export interface SurveyQuestion {
  id: number
  survey_id: number
  key: string
  type: SurveyQuestionType
  position: number
  config: SurveyQuestionConfig
}

/** A question as supplied by the admin builder (no id/survey_id yet). */
export interface SurveyQuestionInput {
  key: string
  type: SurveyQuestionType
  config?: SurveyQuestionConfig
}

/** Translatable strings for one language; mirrors the seeded blob shape. */
export interface SurveyTranslationContent {
  page?: Record<string, string>
  questions?: Record<string, { label?: string; scale?: Record<string, string> }>
  email?: {
    subject?: string
    header?: string
    greeting?: string
    greeting_fallback?: string
    cta?: string
    signoff?: string
    team?: string
    body?: Record<string, any>
  }
}

export interface Survey {
  id: number
  key: string
  title: string
  status: 'open' | 'closed'
  created_at: string
  updated_at: string
}

export interface SurveyAnswerInput {
  question_key: string
  value_int?: number | null
  value_text?: string | null
}

export interface ScaleAggregate {
  key: string
  count: number
  average: number | null
  distribution: Record<number, number>
}

export interface TextAggregate {
  key: string
  answers: string[]
}

export interface SurveyResults {
  totalResponses: number
  scale: ScaleAggregate[]
  text: TextAggregate[]
}

class SurveyService {
  private sql = getSql()

  async getByKey(key: string): Promise<Survey | null> {
    const [row] = await this.sql<Survey[]>`SELECT * FROM surveys WHERE key = ${key}`
    return row ?? null
  }

  async getById(id: number): Promise<Survey | null> {
    const [row] = await this.sql<Survey[]>`SELECT * FROM surveys WHERE id = ${id}`
    return row ?? null
  }

  async listWithResponseCounts(): Promise<Array<Survey & { response_count: number }>> {
    return await this.sql<Array<Survey & { response_count: number }>>`
      SELECT s.*, COUNT(sr.id)::int AS response_count
      FROM surveys s
      LEFT JOIN survey_responses sr ON sr.survey_id = s.id
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `
  }

  // -- Questions (structural, language-independent) -------------------------

  async getQuestions(surveyId: number): Promise<SurveyQuestion[]> {
    return await this.sql<SurveyQuestion[]>`
      SELECT id, survey_id, key, type, position, config
      FROM survey_questions
      WHERE survey_id = ${surveyId}
      ORDER BY position ASC, id ASC
    `
  }

  /** Replace the survey's question set with the supplied list (positions follow array order). */
  async upsertQuestions(surveyId: number, questions: SurveyQuestionInput[]): Promise<void> {
    await this.sql.begin(async (tx) => {
      const keys = questions.map(q => q.key)
      if (keys.length > 0) {
        await tx`DELETE FROM survey_questions WHERE survey_id = ${surveyId} AND key NOT IN ${tx(keys)}`
      } else {
        await tx`DELETE FROM survey_questions WHERE survey_id = ${surveyId}`
      }
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i]!
        await tx`
          INSERT INTO survey_questions (survey_id, key, type, position, config)
          VALUES (${surveyId}, ${q.key}, ${q.type}, ${i}, ${tx.json((q.config ?? {}) as any)})
          ON CONFLICT (survey_id, key)
          DO UPDATE SET type = EXCLUDED.type, position = EXCLUDED.position,
                        config = EXCLUDED.config, updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
        `
      }
    })
  }

  // -- Translations (one JSONB blob per language) ---------------------------

  /** Translation content for a language, falling back to English then {}. */
  async getTranslation(surveyId: number, language: string): Promise<SurveyTranslationContent> {
    const rows = await this.sql<{ language_code: string; content: SurveyTranslationContent }[]>`
      SELECT language_code, content FROM survey_translations
      WHERE survey_id = ${surveyId} AND language_code IN (${language}, 'en')
    `
    const exact = rows.find(r => r.language_code === language)
    const en = rows.find(r => r.language_code === 'en')
    return exact?.content ?? en?.content ?? {}
  }

  /** All languages keyed by code (for the admin editor and bulk translation). */
  async getAllTranslations(surveyId: number): Promise<Record<string, SurveyTranslationContent>> {
    const rows = await this.sql<{ language_code: string; content: SurveyTranslationContent }[]>`
      SELECT language_code, content FROM survey_translations WHERE survey_id = ${surveyId}
    `
    const map: Record<string, SurveyTranslationContent> = {}
    for (const row of rows) map[row.language_code] = row.content
    return map
  }

  async upsertTranslation(surveyId: number, language: string, content: SurveyTranslationContent): Promise<void> {
    await this.sql`
      INSERT INTO survey_translations (survey_id, language_code, content)
      VALUES (${surveyId}, ${language}, ${this.sql.json(content as any)})
      ON CONFLICT (survey_id, language_code)
      DO UPDATE SET content = EXCLUDED.content, updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
    `
  }

  // -- Admin CRUD -----------------------------------------------------------

  async create(data: { key: string; title: string; status?: 'open' | 'closed' }): Promise<Survey> {
    const [row] = await this.sql<Survey[]>`
      INSERT INTO surveys (key, title, status)
      VALUES (${data.key}, ${data.title}, ${data.status ?? 'open'})
      RETURNING *
    `
    return row!
  }

  async update(id: number, data: { title?: string; status?: 'open' | 'closed' }): Promise<Survey | null> {
    const fields: Fragment[] = []
    if (data.title !== undefined) fields.push(this.sql`title = ${data.title}`)
    if (data.status !== undefined) fields.push(this.sql`status = ${data.status}`)
    if (fields.length === 0) return this.getById(id)
    fields.push(this.sql`updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'`)
    await this.sql`UPDATE surveys SET ${buildSet(this.sql, fields)} WHERE id = ${id}`
    return this.getById(id)
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.sql`DELETE FROM surveys WHERE id = ${id}`
    return result.count > 0
  }

  // -- Responses ------------------------------------------------------------

  /** Existing answers for a subscriber, keyed by question_key, for edit prefill. */
  async getResponseForSubscriber(
    surveyId: number,
    subscriberId: number
  ): Promise<{ id: number; answers: Record<string, number | string> } | null> {
    const [response] = await this.sql<{ id: number }[]>`
      SELECT id FROM survey_responses
      WHERE survey_id = ${surveyId} AND subscriber_id = ${subscriberId}
    `
    if (!response) return null

    const rows = await this.sql<{ question_key: string; value_int: number | null; value_text: string | null }[]>`
      SELECT question_key, value_int, value_text FROM survey_answers WHERE response_id = ${response.id}
    `

    const answers: Record<string, number | string> = {}
    for (const row of rows) {
      if (row.value_int !== null) answers[row.question_key] = row.value_int
      else if (row.value_text !== null) answers[row.question_key] = row.value_text
    }

    return { id: response.id, answers }
  }

  /** Upsert a subscriber's response and answers. Re-submission overwrites in place. */
  async upsertResponse(
    surveyId: number,
    subscriberId: number,
    profileId: string,
    answers: SurveyAnswerInput[],
    metadata: Record<string, any>
  ): Promise<void> {
    await this.sql.begin(async (tx) => {
      const [response] = await tx`
        INSERT INTO survey_responses (survey_id, subscriber_id, profile_id, metadata)
        VALUES (${surveyId}, ${subscriberId}, ${profileId}, ${tx.json(metadata)})
        ON CONFLICT (survey_id, subscriber_id)
        DO UPDATE SET metadata = EXCLUDED.metadata, updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
        RETURNING id
      `
      const responseId = response!.id

      for (const answer of answers) {
        await tx`
          INSERT INTO survey_answers (response_id, question_key, value_int, value_text)
          VALUES (${responseId}, ${answer.question_key}, ${answer.value_int ?? null}, ${answer.value_text ?? null})
          ON CONFLICT (response_id, question_key)
          DO UPDATE SET value_int = EXCLUDED.value_int, value_text = EXCLUDED.value_text
        `
      }
    })
  }

  async getResults(surveyId: number): Promise<SurveyResults> {
    const questions = await this.getQuestions(surveyId)
    const scaleKeys = questions.filter(q => q.type === 'scale').map(q => q.key)
    const textKeys = questions.filter(q => q.type === 'text').map(q => q.key)

    const totalRows = await this.sql<{ n: number }[]>`
      SELECT COUNT(*)::int as n FROM survey_responses WHERE survey_id = ${surveyId}
    `
    const totalResponses = totalRows[0]?.n ?? 0

    const scaleRows = await this.sql<{ question_key: string; value_int: number; n: number }[]>`
      SELECT sa.question_key, sa.value_int, COUNT(*)::int as n
      FROM survey_answers sa
      JOIN survey_responses sr ON sr.id = sa.response_id
      WHERE sr.survey_id = ${surveyId} AND sa.value_int IS NOT NULL
      GROUP BY sa.question_key, sa.value_int
    `

    const scale: ScaleAggregate[] = scaleKeys.map((key) => {
      const rows = scaleRows.filter(r => r.question_key === key)
      const distribution: Record<number, number> = {}
      let sum = 0
      let count = 0
      for (const row of rows) {
        distribution[row.value_int] = row.n
        sum += row.value_int * row.n
        count += row.n
      }
      return { key, count, average: count > 0 ? sum / count : null, distribution }
    })

    const textRows = await this.sql<{ question_key: string; value_text: string }[]>`
      SELECT sa.question_key, sa.value_text
      FROM survey_answers sa
      JOIN survey_responses sr ON sr.id = sa.response_id
      WHERE sr.survey_id = ${surveyId} AND sa.value_text IS NOT NULL AND sa.value_text <> ''
      ORDER BY sr.updated_at DESC
    `

    const text: TextAggregate[] = textKeys.map((key) => ({
      key,
      answers: textRows.filter(r => r.question_key === key).map(r => r.value_text)
    }))

    return { totalResponses, scale, text }
  }

  /** Flat rows for CSV export — one row per response, one column per question. */
  async getResponsesForExport(surveyId: number): Promise<Array<Record<string, unknown>>> {
    const questions = await this.getQuestions(surveyId)

    const responses = await this.sql<{
      id: number
      profile_id: string | null
      metadata: Record<string, unknown> | null
      created_at: string
      updated_at: string
    }[]>`
      SELECT id, profile_id, metadata, created_at, updated_at
      FROM survey_responses
      WHERE survey_id = ${surveyId}
      ORDER BY created_at ASC
    `

    if (responses.length === 0) return []

    const answers = await this.sql<{ response_id: number; question_key: string; value_int: number | null; value_text: string | null }[]>`
      SELECT sa.response_id, sa.question_key, sa.value_int, sa.value_text
      FROM survey_answers sa
      JOIN survey_responses sr ON sr.id = sa.response_id
      WHERE sr.survey_id = ${surveyId}
    `

    return responses.map((response) => {
      const row: Record<string, unknown> = {
        profile_id: response.profile_id ?? '',
        submitted_at: response.created_at,
        updated_at: response.updated_at,
        preferred_language: (response.metadata as any)?.preferred_language ?? '',
        people_groups: ((response.metadata as any)?.people_group_names ?? []).join('; ')
      }
      for (const question of questions) {
        const answer = answers.find(a => a.response_id === response.id && a.question_key === question.key)
        row[question.key] = question.type === 'scale' ? (answer?.value_int ?? '') : (answer?.value_text ?? '')
      }
      return row
    })
  }
}

export const surveyService = new SurveyService()
