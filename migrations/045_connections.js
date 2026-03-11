class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class ConnectionsMigration extends BaseMigration {
  id = 45
  name = 'Create connections table'

  // Polymorphic join table — no FK constraints by design.
  // Any code that deletes a subscriber or group must also clean up
  // its connections (see connectionService.deleteForEntity).
  async up(sql) {
    await this.exec(sql, `
      CREATE TABLE IF NOT EXISTS connections (
        id SERIAL PRIMARY KEY,
        from_type TEXT NOT NULL,
        from_id INTEGER NOT NULL,
        to_type TEXT NOT NULL,
        to_id INTEGER NOT NULL,
        connection_type TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(from_type, from_id, to_type, to_id, connection_type)
      )
    `)

    await this.exec(sql, 'CREATE INDEX IF NOT EXISTS idx_connections_from ON connections(from_type, from_id)')
    await this.exec(sql, 'CREATE INDEX IF NOT EXISTS idx_connections_to ON connections(to_type, to_id)')
  }
}
