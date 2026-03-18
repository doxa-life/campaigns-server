import { getSql } from './db'

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
  private sql = getSql()

  async create(data: {
    record_type: string
    record_id: number
    user_id?: string | null
    author_label?: string | null
    content: Record<string, any>
  }): Promise<Comment> {
    const [row] = await this.sql`
      INSERT INTO comments (record_type, record_id, user_id, author_label, content)
      VALUES (${data.record_type}, ${data.record_id}, ${data.user_id || null}, ${data.author_label || null}, ${this.sql.json(data.content)})
      RETURNING *
    `
    return row
  }

  async getById(id: number): Promise<Comment | null> {
    const [row] = await this.sql`SELECT * FROM comments WHERE id = ${id}`
    return row || null
  }

  async getForRecord(recordType: string, recordId: number): Promise<CommentWithAuthor[]> {
    return await this.sql`
      SELECT c.*,
        COALESCE(u.display_name, c.author_label, 'Unknown') as author_name
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.record_type = ${recordType} AND c.record_id = ${recordId}
      ORDER BY c.created_at ASC
    `
  }

  async update(id: number, content: Record<string, any>): Promise<Comment | null> {
    const [row] = await this.sql`
      UPDATE comments SET content = ${this.sql.json(content)}, updated_at = NOW() WHERE id = ${id}
      RETURNING *
    `
    return row || null
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.sql`DELETE FROM comments WHERE id = ${id}`
    return result.count > 0
  }

  async deleteForRecord(recordType: string, recordId: number): Promise<number> {
    const result = await this.sql`
      DELETE FROM comments WHERE record_type = ${recordType} AND record_id = ${recordId}
    `
    return result.count
  }
}

export const commentService = new CommentService()
