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
    const [row] = await this.sql`
      SELECT 1 FROM spam_senders
      WHERE LOWER(email) = LOWER(${email})
      LIMIT 1
    `
    return !!row
  }

  async add(email: string, createdBy?: string | null): Promise<SpamSender> {
    const [row] = await this.sql`
      INSERT INTO spam_senders (email, created_by)
      VALUES (LOWER(${email}), ${createdBy || null})
      ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
      RETURNING *
    `
    return row as SpamSender
  }

  async remove(email: string): Promise<boolean> {
    const result = await this.sql`DELETE FROM spam_senders WHERE LOWER(email) = LOWER(${email})`
    return result.count > 0
  }
}

export const spamSenderService = new SpamSenderService()
