import { getDatabase } from './db'

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
  private db = getDatabase()

  // Create library content
  async createLibraryContent(data: CreateLibraryContentData): Promise<LibraryContent> {
    const {
      library_id,
      day_number,
      language_code,
      content_json = null
    } = data

    const stmt = this.db.prepare(`
      INSERT INTO library_content (library_id, day_number, language_code, content_json)
      VALUES (?, ?, ?, ?)
    `)

    try {
      const result = await stmt.run(library_id, day_number, language_code, content_json)
      const contentId = result.lastInsertRowid as number

      return (await this.getLibraryContentById(contentId))!
    } catch (error: any) {
      if (error.code === '23505') { // PostgreSQL unique violation
        throw new Error('Content already exists for this library, day, and language')
      }
      throw error
    }
  }

  // Get library content by ID
  async getLibraryContentById(id: number): Promise<LibraryContent | null> {
    const contentStmt = this.db.prepare(`
      SELECT * FROM library_content WHERE id = ?
    `)
    return await contentStmt.get(id) as LibraryContent | null
  }

  // Get library content by day and language
  async getLibraryContentByDay(libraryId: number, dayNumber: number, languageCode: string = 'en'): Promise<LibraryContent | null> {
    const contentStmt = this.db.prepare(`
      SELECT * FROM library_content WHERE library_id = ? AND day_number = ? AND language_code = ?
    `)
    return await contentStmt.get(libraryId, dayNumber, languageCode) as LibraryContent | null
  }

  // Get all languages available for a specific library and day
  async getAvailableLanguages(libraryId: number, dayNumber: number): Promise<string[]> {
    const stmt = this.db.prepare(`
      SELECT language_code FROM library_content
      WHERE library_id = ? AND day_number = ?
      ORDER BY language_code
    `)
    const results = await stmt.all(libraryId, dayNumber) as Array<{ language_code: string }>
    return results.map(r => r.language_code)
  }

  // Get all library content for a library
  async getLibraryContent(libraryId: number, options?: {
    startDay?: number
    endDay?: number
    language?: string
    limit?: number
    offset?: number
  }): Promise<LibraryContent[]> {
    let query = `
      SELECT * FROM library_content WHERE library_id = ?
    `
    const params: any[] = [libraryId]

    if (options?.startDay !== undefined) {
      query += ' AND day_number >= ?'
      params.push(options.startDay)
    }

    if (options?.endDay !== undefined) {
      query += ' AND day_number <= ?'
      params.push(options.endDay)
    }

    if (options?.language) {
      query += ' AND language_code = ?'
      params.push(options.language)
    }

    query += ' ORDER BY day_number ASC, language_code'

    if (options?.limit) {
      query += ' LIMIT ?'
      params.push(options.limit)

      if (options?.offset) {
        query += ' OFFSET ?'
        params.push(options.offset)
      }
    }

    const stmt = this.db.prepare(query)
    return await stmt.all(...params) as LibraryContent[]
  }

  // Get library content grouped by day with language information
  async getLibraryContentGroupedByDay(libraryId: number, options?: {
    startDay?: number
    endDay?: number
    limit?: number
    offset?: number
  }): Promise<Array<{ dayNumber: number; languages: string[] }>> {
    let query = `
      SELECT day_number as "dayNumber", STRING_AGG(language_code, ',') as languages
      FROM library_content
      WHERE library_id = ?
    `
    const params: any[] = [libraryId]

    if (options?.startDay !== undefined) {
      query += ' AND day_number >= ?'
      params.push(options.startDay)
    }

    if (options?.endDay !== undefined) {
      query += ' AND day_number <= ?'
      params.push(options.endDay)
    }

    query += ' GROUP BY day_number ORDER BY day_number ASC'

    if (options?.limit) {
      query += ' LIMIT ?'
      params.push(options.limit)

      if (options?.offset) {
        query += ' OFFSET ?'
        params.push(options.offset)
      }
    }

    const stmt = this.db.prepare(query)
    const results = await stmt.all(...params) as Array<{ dayNumber: number; languages: string }>
    return results.map(r => ({
      dayNumber: r.dayNumber,
      languages: r.languages.split(',')
    }))
  }

  // Get day range for library (min and max day numbers)
  async getDayRange(libraryId: number): Promise<{ minDay: number; maxDay: number } | null> {
    const stmt = this.db.prepare(`
      SELECT MIN(day_number) as "minDay", MAX(day_number) as "maxDay"
      FROM library_content
      WHERE library_id = ?
    `)
    const result = await stmt.get(libraryId) as { minDay: number | null; maxDay: number | null } | null

    if (!result || result.minDay === null || result.maxDay === null) {
      return null
    }

    return {
      minDay: result.minDay,
      maxDay: result.maxDay
    }
  }

  // Update library content
  async updateLibraryContent(id: number, data: UpdateLibraryContentData): Promise<LibraryContent | null> {
    const content = await this.getLibraryContentById(id)
    if (!content) {
      return null
    }

    // If day or language is being updated, check for conflicts with other records
    if (data.day_number !== undefined || data.language_code !== undefined) {
      const checkDay = data.day_number !== undefined ? data.day_number : content.day_number
      const checkLanguage = data.language_code !== undefined ? data.language_code : content.language_code

      const conflictStmt = this.db.prepare(`
        SELECT id FROM library_content
        WHERE library_id = ? AND day_number = ? AND language_code = ? AND id != ?
      `)
      const conflict = await conflictStmt.get(content.library_id, checkDay, checkLanguage, id)

      if (conflict) {
        throw new Error('Content already exists for this library, day, and language')
      }
    }

    const updates: string[] = []
    const values: any[] = []

    if (data.content_json !== undefined) {
      updates.push('content_json = ?')
      values.push(data.content_json)
    }

    if (data.day_number !== undefined) {
      updates.push('day_number = ?')
      values.push(data.day_number)
    }

    if (data.language_code !== undefined) {
      updates.push('language_code = ?')
      values.push(data.language_code)
    }

    if (updates.length === 0) {
      return content
    }

    updates.push("updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'")
    values.push(id)

    const stmt = this.db.prepare(`
      UPDATE library_content SET ${updates.join(', ')}
      WHERE id = ?
    `)

    await stmt.run(...values)
    return this.getLibraryContentById(id)
  }

  // Delete library content
  async deleteLibraryContent(id: number): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM library_content WHERE id = ?')
    const result = await stmt.run(id)
    return result.changes > 0
  }

  // Get content count for library
  async getContentCount(libraryId: number): Promise<number> {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM library_content WHERE library_id = ?')
    const result = await stmt.get(libraryId) as { count: number }
    return result.count
  }

  // Check if content exists for specific day and language
  async hasContentForDay(libraryId: number, dayNumber: number, languageCode?: string): Promise<boolean> {
    let query = 'SELECT COUNT(*) as count FROM library_content WHERE library_id = ? AND day_number = ?'
    const params: any[] = [libraryId, dayNumber]

    if (languageCode) {
      query += ' AND language_code = ?'
      params.push(languageCode)
    }

    const stmt = this.db.prepare(query)
    const result = await stmt.get(...params) as { count: number }
    return result.count > 0
  }

  // Get all content for export (no pagination)
  async getAllContentForExport(libraryId: number): Promise<Array<{
    day_number: number
    language_code: string
    content_json: Record<string, any> | null
  }>> {
    const stmt = this.db.prepare(`
      SELECT day_number, language_code, content_json
      FROM library_content
      WHERE library_id = ?
      ORDER BY day_number ASC, language_code ASC
    `)
    return await stmt.all(libraryId) as Array<{
      day_number: number
      language_code: string
      content_json: Record<string, any> | null
    }>
  }

  // Bulk create content for import
  // Accepts optional db parameter for transaction support
  async bulkCreateContent(
    libraryId: number,
    items: Array<{
      day_number: number
      language_code: string
      content_json: Record<string, any> | null
    }>,
    db?: ReturnType<typeof getDatabase>
  ): Promise<{ inserted: number; skipped: number }> {
    const database = db || this.db
    let inserted = 0
    let skipped = 0

    // Process in batches
    const batchSize = 100
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize)

      for (const item of batch) {
        try {
          const stmt = database.prepare(`
            INSERT INTO library_content (library_id, day_number, language_code, content_json)
            VALUES (?, ?, ?, ?)
            ON CONFLICT (library_id, day_number, language_code) DO NOTHING
          `)
          const result = await stmt.run(libraryId, item.day_number, item.language_code, item.content_json)
          if (result.changes > 0) {
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

  // Bulk upsert content — inserts or overwrites translations in a single multi-row operation
  async bulkUpsertContent(
    libraryId: number,
    items: Array<{
      day_number: number
      language_code: string
      content_json: Record<string, any> | null
    }>
  ): Promise<{ upserted: number }> {
    const raw = this.db.rawSql
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

      const result = await raw`
        INSERT INTO library_content ${raw(rows, 'library_id', 'day_number', 'language_code', 'content_json')}
        ON CONFLICT (library_id, day_number, language_code)
        DO UPDATE SET content_json = EXCLUDED.content_json,
                      updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      `
      upserted += result.count
    }

    return { upserted }
  }

  // Delete all content for a library (used before overwriting)
  // Accepts optional db parameter for transaction support
  async deleteAllLibraryContent(libraryId: number, db?: ReturnType<typeof getDatabase>): Promise<number> {
    const database = db || this.db
    const stmt = database.prepare('DELETE FROM library_content WHERE library_id = ?')
    const result = await stmt.run(libraryId)
    return result.changes
  }
}

// Export singleton instance
export const libraryContentService = new LibraryContentService()
