import { getSql } from './db'

export class UserLanguageService {
  private sql = getSql()

  async getUserLanguages(userId: string): Promise<string[]> {
    const results = await this.sql`
      SELECT language_code FROM user_languages
      WHERE user_id = ${userId}
      ORDER BY language_code
    `
    return results.map((r: any) => r.language_code)
  }

  async setUserLanguages(userId: string, languageCodes: string[]): Promise<void> {
    await this.sql.begin(async (tx: any) => {
      await tx`DELETE FROM user_languages WHERE user_id = ${userId}`
      for (const code of languageCodes) {
        await tx`
          INSERT INTO user_languages (user_id, language_code)
          VALUES (${userId}, ${code})
          ON CONFLICT DO NOTHING
        `
      }
    })
  }

  async userHasLanguageAccess(userId: string, languageCode: string): Promise<boolean> {
    const [row] = await this.sql`
      SELECT 1 FROM user_languages
      WHERE user_id = ${userId} AND language_code = ${languageCode}
      LIMIT 1
    `
    return !!row
  }
}

export const userLanguageService = new UserLanguageService()
