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

export default class PeopleGroupReportsPublicMigration extends BaseMigration {
  id = 92
  name = 'Public submission support for people_group_reports'

  async up(sql) {
    // A report is either entered by an admin (single-review instant apply) or
    // submitted through the public /updates form (email verification, two
    // designated approvers, then an explicit apply step).
    await this.exec(sql, `
      ALTER TABLE people_group_reports
      ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'update',
      ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'admin',
      ADD COLUMN IF NOT EXISTS reporter_org TEXT,
      ADD COLUMN IF NOT EXISTS verifier_name TEXT,
      ADD COLUMN IF NOT EXISTS verifier_entity TEXT,
      ADD COLUMN IF NOT EXISTS verifier_email TEXT,
      ADD COLUMN IF NOT EXISTS reporter_contact_method_id INTEGER REFERENCES contact_methods(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS approvals JSONB NOT NULL DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS suggested_image_key TEXT
    `)

    await this.exec(sql, 'ALTER TABLE people_group_reports DROP CONSTRAINT IF EXISTS people_group_reports_status_check')
    await this.exec(sql, `
      ALTER TABLE people_group_reports
      ADD CONSTRAINT people_group_reports_status_check
      CHECK (status IN ('awaiting_verification', 'pending', 'approved', 'accepted', 'denied'))
    `)
    await this.exec(sql, `
      ALTER TABLE people_group_reports
      ADD CONSTRAINT people_group_reports_type_check
      CHECK (type IN ('add', 'update', 'remove'))
    `)
    await this.exec(sql, `
      ALTER TABLE people_group_reports
      ADD CONSTRAINT people_group_reports_source_check
      CHECK (source IN ('admin', 'public'))
    `)
  }
}
