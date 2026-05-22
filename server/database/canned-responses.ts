import { getSql } from './db'

export interface CannedResponseTranslation {
  id: number
  canned_response_id: number
  language_code: string
  body_html: string | null
}

export interface CannedResponse {
  id: number
  title: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CannedResponseWithTranslations extends CannedResponse {
  translations: CannedResponseTranslation[]
}

class CannedResponseService {
  private sql = getSql()

  async list(): Promise<CannedResponseWithTranslations[]> {
    const responses = await this.sql<CannedResponse[]>`
      SELECT * FROM canned_responses ORDER BY title ASC
    `
    if (responses.length === 0) return []

    const ids = responses.map(r => r.id)
    const translations = await this.sql<CannedResponseTranslation[]>`
      SELECT * FROM canned_response_translations WHERE canned_response_id IN ${this.sql(ids)}
    `

    return responses.map(r => ({
      ...r,
      translations: translations.filter(t => t.canned_response_id === r.id)
    }))
  }

  async getById(id: number): Promise<CannedResponseWithTranslations | null> {
    const [response] = await this.sql<CannedResponse[]>`SELECT * FROM canned_responses WHERE id = ${id}`
    if (!response) return null
    const translations = await this.sql<CannedResponseTranslation[]>`
      SELECT * FROM canned_response_translations WHERE canned_response_id = ${id}
    `
    return { ...response, translations }
  }

  async create(data: {
    title: string
    created_by: string | null
    translations: { language_code: string; body_html: string }[]
  }): Promise<CannedResponseWithTranslations> {
    const [response] = await this.sql<CannedResponse[]>`
      INSERT INTO canned_responses (title, created_by)
      VALUES (${data.title}, ${data.created_by})
      RETURNING *
    `
    await this.replaceTranslations(response!.id, data.translations)
    return (await this.getById(response!.id))!
  }

  async update(id: number, data: {
    title?: string
    translations?: { language_code: string; body_html: string }[]
  }): Promise<CannedResponseWithTranslations | null> {
    if (data.title !== undefined) {
      await this.sql`UPDATE canned_responses SET title = ${data.title}, updated_at = NOW() WHERE id = ${id}`
    }
    if (data.translations !== undefined) {
      await this.replaceTranslations(id, data.translations)
    }
    return this.getById(id)
  }

  private async replaceTranslations(id: number, translations: { language_code: string; body_html: string }[]): Promise<void> {
    await this.sql`DELETE FROM canned_response_translations WHERE canned_response_id = ${id}`
    for (const t of translations) {
      if (!t.language_code) continue
      await this.sql`
        INSERT INTO canned_response_translations (canned_response_id, language_code, body_html)
        VALUES (${id}, ${t.language_code}, ${t.body_html ?? null})
      `
    }
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.sql`DELETE FROM canned_responses WHERE id = ${id}`
    return result.count > 0
  }
}

export const cannedResponseService = new CannedResponseService()
