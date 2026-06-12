import { getSql } from './db'

export interface GroundingDocument {
  id: number
  source: string
  doc_key: string
  title: string | null
  body_text: string
  fetched_at: string
}

export interface UpsertGroundingDocumentData {
  source: string
  doc_key: string
  title?: string | null
  body_text: string
}

class GroundingDocumentService {
  private sql = getSql()

  async upsert(data: UpsertGroundingDocumentData): Promise<GroundingDocument> {
    const [row] = await this.sql<GroundingDocument[]>`
      INSERT INTO grounding_documents (source, doc_key, title, body_text, fetched_at)
      VALUES (${data.source}, ${data.doc_key}, ${data.title ?? null}, ${data.body_text}, NOW())
      ON CONFLICT (source, doc_key) DO UPDATE
        SET title = EXCLUDED.title,
            body_text = EXCLUDED.body_text,
            fetched_at = NOW()
      RETURNING *
    `
    return row!
  }

  async list(source?: string): Promise<GroundingDocument[]> {
    if (source) {
      return await this.sql<GroundingDocument[]>`
        SELECT * FROM grounding_documents WHERE source = ${source} ORDER BY doc_key ASC
      `
    }
    return await this.sql<GroundingDocument[]>`
      SELECT * FROM grounding_documents ORDER BY source ASC, doc_key ASC
    `
  }

  // Cross-instance freshness key for the in-process static-pack cache: every sync
  // rewrites fetched_at, so a change in this value means the snapshots changed.
  async latestFetchedAt(source: string): Promise<string | null> {
    const [row] = await this.sql<{ latest: unknown }[]>`
      SELECT max(fetched_at) AS latest FROM grounding_documents WHERE source = ${source}
    `
    return row?.latest == null ? null : String(row.latest)
  }

  // Remove snapshots of a source whose doc_key is no longer in the configured set —
  // without this, pages dropped from the CMS would keep grounding drafts forever.
  async deleteKeysNotIn(source: string, keys: string[]): Promise<number> {
    if (!keys.length) return 0
    const result = await this.sql`
      DELETE FROM grounding_documents
      WHERE source = ${source} AND doc_key <> ALL(${keys})
    `
    return result.count
  }
}

export const groundingDocumentService = new GroundingDocumentService()
