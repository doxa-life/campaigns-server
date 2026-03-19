import type { Sql, Fragment } from 'postgres'
import { getSql } from './db'
import { buildSet } from './sql-helpers'

export interface LibraryContent {
  id: number
  library_id: number
  day_number: number
  language_code: string
  content_json: Record<string, any> | null
  created_at: string
  updated_at: string
}


export interface CreateLibraryContentData {
  library_id: number
  day_number: number
  language_code: string
  content_json?: any
}

export interface UpdateLibraryContentData {
  content_json?: any
  day_number?: number
  language_code?: string
}

export class LibraryContentService {
  private sql = getSql()

  async createLibraryContent(data: CreateLibraryContentData): Promise<LibraryContent> {
    const { library_id, day_number, language_code, content_json = null } = data

    try {
      const [row] = await this.sql`
        INSERT INTO library_content (library_id, day_number, language_code, content_json)
        VALUES (${library_id}, ${day_number}, ${language_code}, ${content_json})
        RETURNING *
      `
      return row as LibraryContent
    } catch (error: any) {
      if (error.code === '23505') {
        throw new Error('Content already exists for this library, day, and language')
      }
      throw error
    }
  }

  async getLibraryContentById(id: number): Promise<LibraryContent | null> {
    const [row] = await this.sql`SELECT * FROM library_content WHERE id = ${id}`
    return (row as LibraryContent) ?? null
  }

  async getLibraryContentByDay(libraryId: number, dayNumber: number, languageCode: string = 'en'): Promise<LibraryContent | null> {
    const [row] = await this.sql`
      SELECT * FROM library_content
      WHERE library_id = ${libraryId} AND day_number = ${dayNumber} AND language_code = ${languageCode}
    `
    return (row as LibraryContent) ?? null
  }

  async getAvailableLanguages(libraryId: number, dayNumber: number): Promise<string[]> {
    const results = await this.sql`
      SELECT language_code FROM library_content
      WHERE library_id = ${libraryId} AND day_number = ${dayNumber}
      ORDER BY language_code
    `
    return results.map((r: any) => r.language_code)
  }

  async getLibraryContent(libraryId: number, options?: {
    startDay?: number
    endDay?: number
    language?: string
    limit?: number
    offset?: number
  }): Promise<LibraryContent[]> {
    const conditions: Fragment[] = [this.sql`library_id = ${libraryId}`]

    if (options?.startDay !== undefined) conditions.push(this.sql`day_number >= ${options.startDay}`)
    if (options?.endDay !== undefined) conditions.push(this.sql`day_number <= ${options.endDay}`)
    if (options?.language) conditions.push(this.sql`language_code = ${options.language}`)

    let combined: Fragment = conditions[0]!
    for (let i = 1; i < conditions.length; i++) {
      combined = this.sql`${combined} AND ${conditions[i]!}`
    }

    const limit = options?.limit || null
    const offset = options?.offset || null

    if (limit) {
      return await this.sql<LibraryContent[]>`
        SELECT * FROM library_content WHERE ${combined}
        ORDER BY day_number ASC, language_code
        LIMIT ${limit} OFFSET ${offset || 0}
      `
    }
    return await this.sql<LibraryContent[]>`
      SELECT * FROM library_content WHERE ${combined}
      ORDER BY day_number ASC, language_code
    `
  }

  async getLibraryContentGroupedByDay(libraryId: number, options?: {
    startDay?: number
    endDay?: number
    limit?: number
    offset?: number
  }): Promise<Array<{ dayNumber: number; languages: string[] }>> {
    const conditions: Fragment[] = [this.sql`library_id = ${libraryId}`]

    if (options?.startDay !== undefined) conditions.push(this.sql`day_number >= ${options.startDay}`)
    if (options?.endDay !== undefined) conditions.push(this.sql`day_number <= ${options.endDay}`)

    let combined: Fragment = conditions[0]!
    for (let i = 1; i < conditions.length; i++) {
      combined = this.sql`${combined} AND ${conditions[i]!}`
    }

    const limit = options?.limit || null
    const offset = options?.offset || null

    let results
    if (limit) {
      results = await this.sql`
        SELECT day_number as "dayNumber", STRING_AGG(language_code, ',') as languages
        FROM library_content WHERE ${combined}
        GROUP BY day_number ORDER BY day_number ASC
        LIMIT ${limit} OFFSET ${offset || 0}
      `
    } else {
      results = await this.sql`
        SELECT day_number as "dayNumber", STRING_AGG(language_code, ',') as languages
        FROM library_content WHERE ${combined}
        GROUP BY day_number ORDER BY day_number ASC
      `
    }

    return results.map((r: any) => ({
      dayNumber: r.dayNumber,
      languages: r.languages.split(',')
    }))
  }

  async getDayRange(libraryId: number): Promise<{ minDay: number; maxDay: number } | null> {
    const [result] = await this.sql`
      SELECT MIN(day_number) as "minDay", MAX(day_number) as "maxDay"
      FROM library_content WHERE library_id = ${libraryId}
    `

    if (!result || result.minDay === null || result.maxDay === null) return null
    return { minDay: result.minDay, maxDay: result.maxDay }
  }

  async updateLibraryContent(id: number, data: UpdateLibraryContentData): Promise<LibraryContent | null> {
    const content = await this.getLibraryContentById(id)
    if (!content) return null

    if (data.day_number !== undefined || data.language_code !== undefined) {
      const checkDay = data.day_number !== undefined ? data.day_number : content.day_number
      const checkLanguage = data.language_code !== undefined ? data.language_code : content.language_code

      const [conflict] = await this.sql`
        SELECT id FROM library_content
        WHERE library_id = ${content.library_id} AND day_number = ${checkDay} AND language_code = ${checkLanguage} AND id != ${id}
      `

      if (conflict) {
        throw new Error('Content already exists for this library, day, and language')
      }
    }

    const fields: Fragment[] = []

    if (data.content_json !== undefined) fields.push(this.sql`content_json = ${data.content_json}`)
    if (data.day_number !== undefined) fields.push(this.sql`day_number = ${data.day_number}`)
    if (data.language_code !== undefined) fields.push(this.sql`language_code = ${data.language_code}`)

    if (fields.length === 0) return content

    fields.push(this.sql`updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'`)

    await this.sql`UPDATE library_content SET ${buildSet(this.sql, fields)} WHERE id = ${id}`
    return this.getLibraryContentById(id)
  }

  async deleteLibraryContent(id: number): Promise<boolean> {
    const result = await this.sql`DELETE FROM library_content WHERE id = ${id}`
    return result.count > 0
  }

  async getContentCount(libraryId: number): Promise<number> {
    const [result] = await this.sql`SELECT COUNT(*) as count FROM library_content WHERE library_id = ${libraryId}`
    return Number(result!.count)
  }

  async hasContentForDay(libraryId: number, dayNumber: number, languageCode?: string): Promise<boolean> {
    if (languageCode) {
      const [result] = await this.sql`
        SELECT COUNT(*) as count FROM library_content
        WHERE library_id = ${libraryId} AND day_number = ${dayNumber} AND language_code = ${languageCode}
      `
      return Number(result!.count) > 0
    }
    const [result] = await this.sql`
      SELECT COUNT(*) as count FROM library_content
      WHERE library_id = ${libraryId} AND day_number = ${dayNumber}
    `
    return Number(result!.count) > 0
  }

  async getAllContentForExport(libraryId: number): Promise<Array<{
    day_number: number
    language_code: string
    content_json: Record<string, any> | null
  }>> {
    return await this.sql`
      SELECT day_number, language_code, content_json
      FROM library_content WHERE library_id = ${libraryId}
      ORDER BY day_number ASC, language_code ASC
    ` as any
  }

  async bulkCreateContent(
    libraryId: number,
    items: Array<{
      day_number: number
      language_code: string
      content_json: Record<string, any> | null
    }>,
    db?: Sql
  ): Promise<{ inserted: number; skipped: number }> {
    const s = db || this.sql
    let inserted = 0
    let skipped = 0

    const batchSize = 100
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize)

      for (const item of batch) {
        try {
          const contentVal = item.content_json ? s.json(item.content_json) : null
          const result = await s`
            INSERT INTO library_content (library_id, day_number, language_code, content_json)
            VALUES (${libraryId}, ${item.day_number}, ${item.language_code}, ${contentVal})
            ON CONFLICT (library_id, day_number, language_code) DO NOTHING
          `
          if (result.count > 0) {
            inserted++
          } else {
            skipped++
          }
        } catch (error) {
          skipped++
        }
      }
    }

    return { inserted, skipped }
  }

  async bulkUpsertContent(
    libraryId: number,
    items: Array<{
      day_number: number
      language_code: string
      content_json: Record<string, any> | null
    }>
  ): Promise<{ upserted: number }> {
    let upserted = 0
    const batchSize = 100

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize)
      const rows = batch.map(item => ({
        library_id: libraryId,
        day_number: item.day_number,
        language_code: item.language_code,
        content_json: item.content_json,
      }))

      const result = await this.sql`
        INSERT INTO library_content ${this.sql(rows, 'library_id', 'day_number', 'language_code', 'content_json')}
        ON CONFLICT (library_id, day_number, language_code)
        DO UPDATE SET content_json = EXCLUDED.content_json,
                      updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      `
      upserted += result.count
    }

    return { upserted }
  }

  async deleteAllLibraryContent(libraryId: number, db?: Sql): Promise<number> {
    const s = db || this.sql
    const result = await s`DELETE FROM library_content WHERE library_id = ${libraryId}`
    return result.count
  }
}

export const libraryContentService = new LibraryContentService()
