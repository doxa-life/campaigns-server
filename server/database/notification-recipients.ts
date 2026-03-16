import { getDatabase } from './db'

export interface NotificationRecipient {
  id: number
  group_key: string
  email: string
  name: string | null
  created_at: string
}

class NotificationRecipientService {
  private db = getDatabase()

  async getByGroup(groupKey: string): Promise<NotificationRecipient[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM notification_recipients WHERE group_key = ? ORDER BY created_at'
    )
    return await stmt.all(groupKey) as NotificationRecipient[]
  }

  async getAll(): Promise<NotificationRecipient[]> {
    const stmt = this.db.prepare(
      'SELECT * FROM notification_recipients ORDER BY group_key, created_at'
    )
    return await stmt.all() as NotificationRecipient[]
  }

  async add(groupKey: string, email: string, name?: string): Promise<NotificationRecipient> {
    const stmt = this.db.prepare(`
      INSERT INTO notification_recipients (group_key, email, name)
      VALUES (?, ?, ?)
      RETURNING *
    `)
    return await stmt.get(groupKey, email, name || null) as NotificationRecipient
  }

  async remove(id: number): Promise<boolean> {
    const result = await this.db.prepare(
      'DELETE FROM notification_recipients WHERE id = ?'
    ).run(id)
    return result.changes > 0
  }
}

export const notificationRecipientService = new NotificationRecipientService()
