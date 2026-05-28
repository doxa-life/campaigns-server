class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }

  async tableExists(sql, tableName) {
    const result = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = ${tableName}
      ) as exists
    `
    return result[0]?.exists || false
  }

  async columnExists(sql, table, column) {
    const result = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}
      ) as exists
    `
    return result[0]?.exists || false
  }
}

export default class SurveyAndEmailTemplateMigration extends BaseMigration {
  id = 70
  name = 'Add survey tables and marketing email template column'

  async up(sql) {
    console.log('📥 Adding survey tables and marketing_emails.template column...')

    // Marketing emails can render from a named template instead of the
    // admin-authored content_json. 'default' preserves the existing behavior.
    if (!(await this.columnExists(sql, 'marketing_emails', 'template'))) {
      await this.exec(sql, `
        ALTER TABLE marketing_emails
        ADD COLUMN template TEXT NOT NULL DEFAULT 'default'
      `)
      console.log('  ✅ Added template column to marketing_emails')
    } else {
      console.log('  ℹ️  template column already exists on marketing_emails')
    }

    await this.exec(sql, `
      CREATE TABLE IF NOT EXISTS surveys (
        id SERIAL PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
        created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
        updated_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      )
    `)
    console.log('  ✅ surveys table ready')

    // One response per subscriber per survey; re-submitting updates in place.
    // metadata snapshots context (language, subscribed people groups) at submit time.
    await this.exec(sql, `
      CREATE TABLE IF NOT EXISTS survey_responses (
        id SERIAL PRIMARY KEY,
        survey_id INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
        subscriber_id INTEGER NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
        profile_id UUID,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
        updated_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
        UNIQUE (survey_id, subscriber_id)
      )
    `)
    console.log('  ✅ survey_responses table ready')

    // One row per answered question. question_key references a code-defined
    // question; scale answers use value_int, open-text answers use value_text.
    await this.exec(sql, `
      CREATE TABLE IF NOT EXISTS survey_answers (
        id SERIAL PRIMARY KEY,
        response_id INTEGER NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
        question_key TEXT NOT NULL,
        value_int INTEGER,
        value_text TEXT,
        UNIQUE (response_id, question_key)
      )
    `)
    console.log('  ✅ survey_answers table ready')

    await this.exec(sql, `
      INSERT INTO surveys (key, title)
      VALUES ('may-2026-survey', 'May 2026 Intercessor Survey')
      ON CONFLICT (key) DO NOTHING
    `)
    console.log('  ✅ Seeded may-2026-survey')

    console.log('🎉 Survey + email template migration completed!')
  }
}
