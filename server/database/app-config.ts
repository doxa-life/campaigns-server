import { getSql } from './db'

export interface AppConfig {
  key: string
  value: string
  updated_at: string
}

export class AppConfigService {
  private sql = getSql()

  async getConfig<T = any>(key: string): Promise<T | null> {
    const [result] = await this.sql`SELECT value FROM app_config WHERE key = ${key}`

    if (!result?.value) {
      return null
    }

    try {
      return JSON.parse(result.value) as T
    } catch (error) {
      console.error(`Failed to parse config for key "${key}":`, error)
      return null
    }
  }

  async setConfig(key: string, value: any): Promise<void> {
    const valueString = JSON.stringify(value)

    await this.sql`
      INSERT INTO app_config (key, value)
      VALUES (${key}, ${valueString})
      ON CONFLICT (key) DO UPDATE SET
        value = ${valueString},
        updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
    `
  }
}

export const appConfigService = new AppConfigService()
