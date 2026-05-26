import { getSql } from './db'

export interface CannedResponseTranslation {
  id: number
  canned_response_id: number
  language_code: string
  body_html: string
}

export interface CannedResponse {
  id: number
  title: string
  created_by: string | null
  created_at: string
  updated_at: string
  translations: CannedResponseTranslation[]
}

class CannedResponseService {
  private sql = getSql()

  async list(): Promise<CannedResponse[]> {
    const rows = await this.sql`
      SELECT r.*,
        COALESCE(json_agg(t.* ORDER BY t.language_code) FILTER (WHERE t.id IS NOT NULL), '[]') AS translations
      FROM canned_responses r
      LEFT JOIN canned_response_translations t ON t.canned_response_id = r.id
      GROUP BY r.id
      ORDER BY r.title ASC
    `
    return rows as any
  }

  async create(data: { title: string; created_by?: string | null; translations?: Array<{ language_code: string; body_html: string }> }): Promise<CannedResponse> {
    const [response] = await this.sql`
      INSERT INTO canned_responses (title, created_by)
      VALUES (${data.title}, ${data.created_by || null})
      RETURNING *
    `
    if (!response) throw new Error('Failed to create canned response')
    await this.replaceTranslations(response.id, data.translations || [])
    return (await this.getById(response.id))!
  }

  async getById(id: number): Promise<CannedResponse | null> {
    const [row] = await this.sql`
      SELECT r.*,
        COALESCE(json_agg(t.* ORDER BY t.language_code) FILTER (WHERE t.id IS NOT NULL), '[]') AS translations
      FROM canned_responses r
      LEFT JOIN canned_response_translations t ON t.canned_response_id = r.id
      WHERE r.id = ${id}
      GROUP BY r.id
    `
    return (row as any) || null
  }

  async update(id: number, data: { title?: string; translations?: Array<{ language_code: string; body_html: string }> }): Promise<CannedResponse | null> {
    if (data.title !== undefined) {
      await this.sql`
        UPDATE canned_responses SET title = ${data.title}, updated_at = NOW()
        WHERE id = ${id}
      `
    }
    if (data.translations) await this.replaceTranslations(id, data.translations)
    return this.getById(id)
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.sql`DELETE FROM canned_responses WHERE id = ${id}`
    return result.count > 0
  }

  private async replaceTranslations(id: number, translations: Array<{ language_code: string; body_html: string }>) {
    await this.sql`DELETE FROM canned_response_translations WHERE canned_response_id = ${id}`
    for (const translation of translations) {
      if (!translation.language_code || !translation.body_html) continue
      await this.sql`
        INSERT INTO canned_response_translations (canned_response_id, language_code, body_html)
        VALUES (${id}, ${translation.language_code}, ${translation.body_html})
      `
    }
  }
}

export const cannedResponseService = new CannedResponseService()
