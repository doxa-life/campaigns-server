import { getSql } from './db'
import {
  MAY_2026_NUMERIC_KEYS,
  MAY_2026_TEXT_KEYS,
  MAY_2026_SURVEY_QUESTIONS
} from '#shared/surveys/may-2026-survey'

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

  async listWithResponseCounts(): Promise<Array<Survey & { response_count: number }>> {
    return await this.sql<Array<Survey & { response_count: number }>>`
      SELECT s.*, COUNT(sr.id)::int AS response_count
      FROM surveys s
      LEFT JOIN survey_responses sr ON sr.survey_id = s.id
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `
  }

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

    const scale: ScaleAggregate[] = MAY_2026_NUMERIC_KEYS.map((key) => {
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

    const text: TextAggregate[] = MAY_2026_TEXT_KEYS.map((key) => ({
      key,
      answers: textRows.filter(r => r.question_key === key).map(r => r.value_text)
    }))

    return { totalResponses, scale, text }
  }

  /** Flat rows for CSV export — one row per response, one column per question. */
  async getResponsesForExport(surveyId: number): Promise<Array<Record<string, unknown>>> {
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
      for (const question of MAY_2026_SURVEY_QUESTIONS) {
        const answer = answers.find(a => a.response_id === response.id && a.question_key === question.key)
        row[question.key] = question.type === 'text' ? (answer?.value_text ?? '') : (answer?.value_int ?? '')
      }
      return row
    })
  }
}

export const surveyService = new SurveyService()
