class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class PeopleGroupReportsMigration extends BaseMigration {
  id = 61
  name = 'Create people_group_reports table'

  async up(sql) {
    await this.exec(sql, `
      CREATE TABLE IF NOT EXISTS people_group_reports (
        id SERIAL PRIMARY KEY,
        people_group_id INTEGER NOT NULL REFERENCES people_groups(id) ON DELETE CASCADE,
        reporter_name TEXT NOT NULL,
        reporter_email TEXT,
        suggested_changes JSONB NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'denied')),
        reviewed_by UUID REFERENCES users(id),
        reviewed_at TIMESTAMP,
        previous_values JSONB,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await this.exec(sql, 'CREATE INDEX IF NOT EXISTS idx_pg_reports_people_group ON people_group_reports(people_group_id)')
    await this.exec(sql, 'CREATE INDEX IF NOT EXISTS idx_pg_reports_status ON people_group_reports(status)')
  }
}
