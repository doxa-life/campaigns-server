import { getDatabase } from './db'

export interface Comment {
  id: number
  record_type: string
  record_id: number
  user_id: string | null
  author_label: string | null
  content: Record<string, any>
  created_at: string
  updated_at: string
}

export interface CommentWithAuthor extends Comment {
  author_name: string
}

class CommentService {
  private db = getDatabase()

  async create(data: {
    record_type: string
    record_id: number
    user_id?: string | null
    author_label?: string | null
    content: Record<string, any>
  }): Promise<Comment> {
    const stmt = this.db.prepare(`
      INSERT INTO comments (record_type, record_id, user_id, author_label, content)
      VALUES (?, ?, ?, ?, ?)
    `)
    const result = await stmt.run(
      data.record_type,
      data.record_id,
      data.user_id || null,
      data.author_label || null,
      data.content
    )
    return (await this.getById(result.lastInsertRowid as number))!
  }

  async getById(id: number): Promise<Comment | null> {
    const stmt = this.db.prepare('SELECT * FROM comments WHERE id = ?')
    const row = await stmt.get(id) as any | null
    if (!row) return null
    return {
      ...row,
      content: typeof row.content === 'string' ? JSON.parse(row.content) : row.content
    }
  }

  async getForRecord(recordType: string, recordId: number): Promise<CommentWithAuthor[]> {
    const stmt = this.db.prepare(`
      SELECT c.*,
        COALESCE(u.display_name, c.author_label, 'Unknown') as author_name
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.record_type = ? AND c.record_id = ?
      ORDER BY c.created_at ASC
    `)
    const rows = await stmt.all(recordType, recordId) as any[]
    return rows.map(row => ({
      ...row,
      content: typeof row.content === 'string' ? JSON.parse(row.content) : row.content
    }))
  }

  async update(id: number, content: Record<string, any>): Promise<Comment | null> {
    const stmt = this.db.prepare(`
      UPDATE comments SET content = ?, updated_at = NOW() WHERE id = ?
    `)
    await stmt.run(content, id)
    return this.getById(id)
  }

  async delete(id: number): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM comments WHERE id = ?')
    const result = await stmt.run(id)
    return result.changes > 0
  }

  async deleteForRecord(recordType: string, recordId: number): Promise<number> {
    const stmt = this.db.prepare(`
      DELETE FROM comments WHERE record_type = ? AND record_id = ?
    `)
    const result = await stmt.run(recordType, recordId)
    return result.changes
  }
}

export const commentService = new CommentService()
