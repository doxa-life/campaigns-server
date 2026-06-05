import { getSql } from './db'

export type KnowledgeEntryStatus = 'active' | 'archived'

export interface InboxKnowledgeEntry {
  id: number
  question: string
  answer: string
  language: string
  source_conversation_id: number | null
  status: KnowledgeEntryStatus
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CreateKnowledgeEntryData {
  question: string
  answer: string
  language?: string
  source_conversation_id?: number | null
  created_by?: string | null
}

export interface UpdateKnowledgeEntryData {
  question?: string
  answer?: string
  language?: string
  status?: KnowledgeEntryStatus
}

class InboxKnowledgeService {
  private sql = getSql()

  async create(data: CreateKnowledgeEntryData): Promise<InboxKnowledgeEntry> {
    const [row] = await this.sql<InboxKnowledgeEntry[]>`
      INSERT INTO inbox_knowledge_entries (
        question, answer, language, source_conversation_id, created_by
      ) VALUES (
        ${data.question}, ${data.answer}, ${data.language || 'en'},
        ${data.source_conversation_id ?? null}, ${data.created_by ?? null}
      )
      RETURNING *
    `
    return row!
  }

  async getById(id: number): Promise<InboxKnowledgeEntry | null> {
    const [row] = await this.sql<InboxKnowledgeEntry[]>`
      SELECT * FROM inbox_knowledge_entries WHERE id = ${id}
    `
    return row ?? null
  }

  async list(options: { status?: KnowledgeEntryStatus } = {}): Promise<InboxKnowledgeEntry[]> {
    if (options.status) {
      return await this.sql<InboxKnowledgeEntry[]>`
        SELECT * FROM inbox_knowledge_entries
        WHERE status = ${options.status}
        ORDER BY updated_at DESC
      `
    }
    return await this.sql<InboxKnowledgeEntry[]>`
      SELECT * FROM inbox_knowledge_entries
      ORDER BY updated_at DESC
    `
  }

  // Active entries only — what the drafting grounding reads.
  async listActive(): Promise<InboxKnowledgeEntry[]> {
    return this.list({ status: 'active' })
  }

  async update(id: number, data: UpdateKnowledgeEntryData): Promise<InboxKnowledgeEntry | null> {
    const [row] = await this.sql<InboxKnowledgeEntry[]>`
      UPDATE inbox_knowledge_entries
      SET question = COALESCE(${data.question ?? null}, question),
          answer = COALESCE(${data.answer ?? null}, answer),
          language = COALESCE(${data.language ?? null}, language),
          status = COALESCE(${data.status ?? null}, status),
          updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `
    return row ?? null
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.sql`DELETE FROM inbox_knowledge_entries WHERE id = ${id}`
    return result.count > 0
  }
}

export const inboxKnowledgeService = new InboxKnowledgeService()
