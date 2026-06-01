import { getSql } from './db'

export interface ReminderEmailSent {
  id: number
  subscription_id: number
  sent_date: string
  sent_at: string
}

class ReminderSentService {
  private sql = getSql()

  async recordSent(subscriptionId: number, date: string): Promise<void> {
    await this.sql`
      INSERT INTO reminder_emails_sent (subscription_id, sent_date)
      VALUES (${subscriptionId}, ${date})
      ON CONFLICT (subscription_id, sent_date) DO NOTHING
    `
  }

  async wasSent(subscriptionId: number, date: string): Promise<boolean> {
    const [result] = await this.sql`
      SELECT 1 FROM reminder_emails_sent
      WHERE subscription_id = ${subscriptionId} AND sent_date = ${date}
    `
    return !!result
  }

  async getSentHistory(subscriptionId: number, limit: number = 30): Promise<ReminderEmailSent[]> {
    return await this.sql`
      SELECT * FROM reminder_emails_sent
      WHERE subscription_id = ${subscriptionId}
      ORDER BY sent_date DESC
      LIMIT ${limit}
    `
  }

  async cleanupOldRecords(daysToKeep: number = 90): Promise<number> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0]!

    const result = await this.sql`
      DELETE FROM reminder_emails_sent
      WHERE sent_date < ${cutoffDateStr}
    `
    return Number(result.count)
  }
}

export const reminderSentService = new ReminderSentService()
