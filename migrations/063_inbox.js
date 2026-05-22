class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }

  async columnExists(sql, table, column) {
    const result = await sql`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = ${table} AND column_name = ${column}
    `
    return result.length > 0
  }
}

export default class InboxMigration extends BaseMigration {
  id = 63
  name = 'Create shared inbox (conversations, messages, attachments, canned responses, spam senders)'

  async up(sql) {
    // Conversations — first-class entities linked to a subscriber
    await this.exec(sql, `
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        subscriber_id INTEGER REFERENCES subscribers(id) ON DELETE CASCADE,
        channel TEXT NOT NULL DEFAULT 'email',
        subject TEXT,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'closed', 'spam')),
        assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        reply_token TEXT UNIQUE NOT NULL,
        needs_review BOOLEAN NOT NULL DEFAULT false,
        last_message_at TIMESTAMPTZ,
        last_message_direction TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await this.exec(sql, `CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations (status, last_message_at)`)
    await this.exec(sql, `CREATE INDEX IF NOT EXISTS idx_conversations_assigned ON conversations (assigned_user_id)`)
    await this.exec(sql, `CREATE INDEX IF NOT EXISTS idx_conversations_subscriber ON conversations (subscriber_id)`)
    await this.exec(sql, `CREATE INDEX IF NOT EXISTS idx_conversations_needs_review ON conversations (needs_review)`)

    // Conversation messages — both inbound (from contact) and outbound (from staff)
    await this.exec(sql, `
      CREATE TABLE IF NOT EXISTS conversation_messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
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
    await this.exec(sql, `CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation ON conversation_messages (conversation_id, created_at)`)

    // Attachments stored in S3, linked to a message
    await this.exec(sql, `
      CREATE TABLE IF NOT EXISTS conversation_attachments (
        id SERIAL PRIMARY KEY,
        message_id INTEGER NOT NULL REFERENCES conversation_messages(id) ON DELETE CASCADE,
        s3_key TEXT NOT NULL,
        filename TEXT,
        content_type TEXT,
        size_bytes INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await this.exec(sql, `CREATE INDEX IF NOT EXISTS idx_conversation_attachments_message ON conversation_attachments (message_id)`)

    // Shared, multilingual canned responses
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
        body_html TEXT,
        UNIQUE (canned_response_id, language_code)
      )
    `)

    // Sender blocklist for spam
    await this.exec(sql, `
      CREATE TABLE IF NOT EXISTS spam_senders (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    // Per-user sending identity + signature
    const hasAlias = await this.columnExists(sql, 'users', 'email_alias')
    if (!hasAlias) {
      await this.exec(sql, `ALTER TABLE users ADD COLUMN email_alias TEXT UNIQUE`)
    }
    const hasSignature = await this.columnExists(sql, 'users', 'email_signature')
    if (!hasSignature) {
      await this.exec(sql, `ALTER TABLE users ADD COLUMN email_signature TEXT`)
    }
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
