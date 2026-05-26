import { getSql } from './db'

export interface SpamSender {
  id: number
  email: string
  created_by: string | null
  created_at: string
}

class SpamSenderService {
  private sql = getSql()

  async isBlocked(email: string): Promise<boolean> {
    if (!email) return false
    const [row] = await this.sql`
      SELECT 1 FROM spam_senders WHERE LOWER(email) = LOWER(${email}) LIMIT 1
    `
    return !!row
  }

  async add(email: string, createdBy: string | null): Promise<SpamSender> {
    const [row] = await this.sql<SpamSender[]>`
      INSERT INTO spam_senders (email, created_by)
      VALUES (${email.toLowerCase()}, ${createdBy})
      ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
      RETURNING *
    `
    return row!
  }

  async remove(email: string): Promise<boolean> {
    const result = await this.sql`DELETE FROM spam_senders WHERE LOWER(email) = LOWER(${email})`
    return result.count > 0
  }

  async list(): Promise<SpamSender[]> {
    return await this.sql<SpamSender[]>`SELECT * FROM spam_senders ORDER BY created_at DESC`
  }
}

export const spamSenderService = new SpamSenderService()
