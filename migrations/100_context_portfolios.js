class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }

  async tableExists(sql, table) {
    const result = await sql`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${table}
    `
    return result.length > 0
  }

  async indexExists(sql, indexName) {
    const result = await sql`
      SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = ${indexName}
    `
    return result.length > 0
  }
}

export default class ContextPortfoliosMigration extends BaseMigration {
  id = 100
  name = 'Create context portfolio tables (portfolios, sections, versions, comments, assistant chats)'

  async up(sql) {
    // A portfolio is one body of organizational context — a set of markdown
    // sections read by people and by AI tools.
    if (!(await this.tableExists(sql, 'context_portfolios'))) {
      await this.exec(sql, `
        CREATE TABLE context_portfolios (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          slug TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          color TEXT,
          icon_url TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
    }

    // One row per section a portfolio has. A built-in row stores only its key
    // and resolves title/description/order from config/context-sections.ts; a
    // custom row carries its own. A stored `order` is an absolute position, so
    // a custom section can sit between two built-ins.
    if (!(await this.tableExists(sql, 'context_section_definitions'))) {
      await this.exec(sql, `
        CREATE TABLE context_section_definitions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          portfolio_id UUID NOT NULL REFERENCES context_portfolios(id) ON DELETE CASCADE,
          key TEXT NOT NULL,
          title TEXT,
          description TEXT,
          "order" INTEGER,
          created_by UUID REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (portfolio_id, key)
        )
      `)
    }

    // Current content for a section key. Rows outlive their definition: removing
    // a section keeps its content, which resurfaces if the key is added again.
    if (!(await this.tableExists(sql, 'context_sections'))) {
      await this.exec(sql, `
        CREATE TABLE context_sections (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          portfolio_id UUID NOT NULL REFERENCES context_portfolios(id) ON DELETE CASCADE,
          section_key TEXT NOT NULL,
          content TEXT NOT NULL DEFAULT '',
          last_edited_by UUID REFERENCES users(id) ON DELETE SET NULL,
          last_edited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (portfolio_id, section_key)
        )
      `)
    }

    // Every save appends a version. `source` records how the change was made:
    // a direct edit, an accepted assistant proposal, or an API client.
    if (!(await this.tableExists(sql, 'context_section_versions'))) {
      await this.exec(sql, `
        CREATE TABLE context_section_versions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          section_id UUID NOT NULL REFERENCES context_sections(id) ON DELETE CASCADE,
          content TEXT NOT NULL,
          edited_by UUID REFERENCES users(id) ON DELETE SET NULL,
          edited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          source TEXT
        )
      `)
    }
    if (!(await this.indexExists(sql, 'idx_context_section_versions_section'))) {
      await this.exec(sql, `
        CREATE INDEX idx_context_section_versions_section
        ON context_section_versions(section_id, edited_at DESC)
      `)
    }

    // A comment anchors to a character range of the section content plus the
    // exact quoted text, so an edit that moves the range can be reported as
    // stale rather than silently pointing at different words.
    if (!(await this.tableExists(sql, 'context_section_comments'))) {
      await this.exec(sql, `
        CREATE TABLE context_section_comments (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          section_id UUID NOT NULL REFERENCES context_sections(id) ON DELETE CASCADE,
          author_id UUID REFERENCES users(id) ON DELETE SET NULL,
          quoted_text TEXT NOT NULL,
          anchor_start INTEGER NOT NULL,
          anchor_end INTEGER NOT NULL,
          anchor_hash TEXT NOT NULL,
          content TEXT NOT NULL,
          is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
          resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
          resolved_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
    }
    if (!(await this.indexExists(sql, 'idx_context_section_comments_section'))) {
      await this.exec(sql, `
        CREATE INDEX idx_context_section_comments_section
        ON context_section_comments(section_id, created_at)
      `)
    }

    if (!(await this.tableExists(sql, 'context_section_comment_replies'))) {
      await this.exec(sql, `
        CREATE TABLE context_section_comment_replies (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          comment_id UUID NOT NULL REFERENCES context_section_comments(id) ON DELETE CASCADE,
          author_id UUID REFERENCES users(id) ON DELETE SET NULL,
          content TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
    }
    if (!(await this.indexExists(sql, 'idx_context_comment_replies_comment'))) {
      await this.exec(sql, `
        CREATE INDEX idx_context_comment_replies_comment
        ON context_section_comment_replies(comment_id, created_at)
      `)
    }

    // Assistant chats are private to the user who started them. A chat is
    // scoped to one section, one portfolio, or the whole workspace; the scope
    // decides what the model is given and may load.
    if (!(await this.tableExists(sql, 'context_assistant_conversations'))) {
      await this.exec(sql, `
        CREATE TABLE context_assistant_conversations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          portfolio_id UUID REFERENCES context_portfolios(id) ON DELETE CASCADE,
          section_key TEXT,
          title TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
    }
    if (!(await this.indexExists(sql, 'idx_context_conversations_user'))) {
      await this.exec(sql, `
        CREATE INDEX idx_context_conversations_user
        ON context_assistant_conversations(user_id, updated_at DESC)
      `)
    }

    // `proposals` holds the section updates the assistant offered in a reply,
    // each with the user's decision, so a proposal can be applied later.
    if (!(await this.tableExists(sql, 'context_assistant_messages'))) {
      await this.exec(sql, `
        CREATE TABLE context_assistant_messages (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          conversation_id UUID NOT NULL REFERENCES context_assistant_conversations(id) ON DELETE CASCADE,
          role TEXT NOT NULL,
          content TEXT NOT NULL DEFAULT '',
          proposals JSONB NOT NULL DEFAULT '[]'::jsonb,
          context_loaded JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
    }
    if (!(await this.indexExists(sql, 'idx_context_messages_conversation'))) {
      await this.exec(sql, `
        CREATE INDEX idx_context_messages_conversation
        ON context_assistant_messages(conversation_id, created_at)
      `)
    }
  }
}
