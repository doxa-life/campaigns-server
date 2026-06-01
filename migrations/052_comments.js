class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class CommentsMigration extends BaseMigration {
  id = 52
  name = 'Create comments table for polymorphic record comments'

  async up(sql) {
    await this.exec(sql, `
      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        record_type TEXT NOT NULL,
        record_id INTEGER NOT NULL,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        author_label TEXT,
        content JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    await this.exec(sql, `
      CREATE INDEX IF NOT EXISTS idx_comments_record
      ON comments (record_type, record_id)
    `)

    await this.exec(sql, `
      CREATE INDEX IF NOT EXISTS idx_comments_user_id
      ON comments (user_id)
    `)

    await this.exec(sql, `
      CREATE INDEX IF NOT EXISTS idx_comments_created_at
      ON comments (created_at)
    `)
  }

  async down(sql) {
    await this.exec(sql, `DROP TABLE IF EXISTS comments`)
  }
}
