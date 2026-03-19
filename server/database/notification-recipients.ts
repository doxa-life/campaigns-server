import { getSql } from './db'

export interface NotificationRecipient {
  id: number
  group_key: string
  email: string
  name: string | null
  created_at: string
}

class NotificationRecipientService {
  private sql = getSql()

  async getByGroup(groupKey: string): Promise<NotificationRecipient[]> {
    return await this.sql`
      SELECT * FROM notification_recipients WHERE group_key = ${groupKey} ORDER BY created_at
    `
  }

  async getAll(): Promise<NotificationRecipient[]> {
    return await this.sql`
      SELECT * FROM notification_recipients ORDER BY group_key, created_at
    `
  }

  async add(groupKey: string, email: string, name?: string): Promise<NotificationRecipient> {
    const [row] = await this.sql`
      INSERT INTO notification_recipients (group_key, email, name)
      VALUES (${groupKey}, ${email}, ${name || null})
      RETURNING *
    `
    return row
  }

  async remove(id: number): Promise<boolean> {
    const result = await this.sql`
      DELETE FROM notification_recipients WHERE id = ${id}
    `
    return result.count > 0
  }
}

export const notificationRecipientService = new NotificationRecipientService()
