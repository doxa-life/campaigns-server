class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class AdoptionReportsMigration extends BaseMigration {
  id = 47
  name = 'Create adoption_reports table'

  async up(sql) {
    await this.exec(sql, `
      CREATE TABLE IF NOT EXISTS adoption_reports (
        id SERIAL PRIMARY KEY,
        adoption_id INTEGER NOT NULL REFERENCES people_group_adoptions(id) ON DELETE CASCADE,
        praying_count INTEGER,
        stories TEXT,
        comments TEXT,
        status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted', 'approved', 'rejected')),
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await this.exec(sql, 'CREATE INDEX IF NOT EXISTS idx_adoption_reports_adoption ON adoption_reports(adoption_id)')
  }
}
