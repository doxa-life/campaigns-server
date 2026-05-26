class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class InboxMigration extends BaseMigration {
  id = 64
  name = 'Create shared inbox tables'

  async up(sql) {
    await this.exec(sql, `
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        subscriber_id INTEGER REFERENCES subscribers(id) ON DELETE CASCADE,
        channel TEXT NOT NULL DEFAULT 'email',
        subject TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        reply_token TEXT UNIQUE NOT NULL,
        needs_review BOOLEAN NOT NULL DEFAULT false,
        last_message_at TIMESTAMPTZ,
        last_message_direction TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    await this.exec(sql, `
      CREATE TABLE IF NOT EXISTS conversation_messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        direction TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'received',
        sender_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        from_email TEXT,
        from_name TEXT,
        to_email TEXT,
        subject TEXT,
        body_html TEXT,
        body_stripped_html TEXT,
        body_text TEXT,
        email_message_id TEXT UNIQUE,
        in_reply_to TEXT,
        email_references TEXT,
        spam_score NUMERIC,
        raw_s3_key TEXT,
        authenticated BOOLEAN NOT NULL DEFAULT false,
        auth_result TEXT,
        hold_reason TEXT,
        failed_reason TEXT,
        provider_message_id TEXT,
        delivered_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    await this.exec(sql, `
      CREATE TABLE IF NOT EXISTS conversation_attachments (
        id SERIAL PRIMARY KEY,
        message_id INTEGER NOT NULL REFERENCES conversation_messages(id) ON DELETE CASCADE,
        s3_key TEXT,
        filename TEXT,
        content_type TEXT,
        size_bytes INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    await this.exec(sql, `
      CREATE TABLE IF NOT EXISTS canned_responses (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    await this.exec(sql, `
      CREATE TABLE IF NOT EXISTS canned_response_translations (
        id SERIAL PRIMARY KEY,
        canned_response_id INTEGER NOT NULL REFERENCES canned_responses(id) ON DELETE CASCADE,
        language_code TEXT NOT NULL,
        body_html TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (canned_response_id, language_code)
      )
    `)

    await this.exec(sql, `
      CREATE TABLE IF NOT EXISTS spam_senders (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    await this.exec(sql, `
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS email_alias TEXT UNIQUE,
        ADD COLUMN IF NOT EXISTS email_signature TEXT
    `)

    await this.exec(sql, `CREATE INDEX IF NOT EXISTS idx_conversations_status_last_message ON conversations (status, last_message_at)`)
    await this.exec(sql, `CREATE INDEX IF NOT EXISTS idx_conversations_assigned_user ON conversations (assigned_user_id)`)
    await this.exec(sql, `CREATE INDEX IF NOT EXISTS idx_conversations_subscriber ON conversations (subscriber_id)`)
    await this.exec(sql, `CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_reply_token ON conversations (reply_token)`)
    await this.exec(sql, `CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation_created ON conversation_messages (conversation_id, created_at)`)
    await this.exec(sql, `CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_messages_email_message_id ON conversation_messages (email_message_id) WHERE email_message_id IS NOT NULL`)
    await this.exec(sql, `CREATE INDEX IF NOT EXISTS idx_conversation_messages_provider_message_id ON conversation_messages (provider_message_id) WHERE provider_message_id IS NOT NULL`)
    await this.exec(sql, `CREATE INDEX IF NOT EXISTS idx_conversation_attachments_message ON conversation_attachments (message_id)`)
  }

  async down(sql) {
    await this.exec(sql, `ALTER TABLE users DROP COLUMN IF EXISTS email_signature`)
    await this.exec(sql, `ALTER TABLE users DROP COLUMN IF EXISTS email_alias`)
    await this.exec(sql, `DROP TABLE IF EXISTS spam_senders`)
    await this.exec(sql, `DROP TABLE IF EXISTS canned_response_translations`)
    await this.exec(sql, `DROP TABLE IF EXISTS canned_responses`)
    await this.exec(sql, `DROP TABLE IF EXISTS conversation_attachments`)
    await this.exec(sql, `DROP TABLE IF EXISTS conversation_messages`)
    await this.exec(sql, `DROP TABLE IF EXISTS conversations`)
  }
}
