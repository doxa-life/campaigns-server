class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class ConnectionsMigration extends BaseMigration {
  id = 46
  name = 'Create connections table'

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
