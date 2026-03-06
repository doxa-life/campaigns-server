class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class GroupsMigration extends BaseMigration {
  id = 44
  name = 'Create groups table'

  async up(sql) {
    await this.exec(sql, `
      CREATE TABLE IF NOT EXISTS groups (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        primary_subscriber_id INTEGER REFERENCES subscribers(id) ON DELETE SET NULL,
        country TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await this.exec(sql, 'CREATE INDEX IF NOT EXISTS idx_groups_name ON groups(name)')
  }
}
