class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class PendingAdoptionsMigration extends BaseMigration {
  id = 49
  name = 'Create pending_adoptions table'

  async up(sql) {
    await this.exec(sql, `
      CREATE TABLE IF NOT EXISTS pending_adoptions (
        id SERIAL PRIMARY KEY,
        contact_method_id INTEGER NOT NULL REFERENCES contact_methods(id) ON DELETE CASCADE,
        people_group_id INTEGER REFERENCES people_groups(id),
        group_id INTEGER REFERENCES groups(id),
        people_group_slug TEXT NOT NULL,
        form_data JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
        updated_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
        UNIQUE(contact_method_id, people_group_id, group_id)
      )
    `)
    await this.exec(sql, `CREATE INDEX IF NOT EXISTS idx_pending_adoptions_contact_method_id ON pending_adoptions(contact_method_id)`)
  }
}
