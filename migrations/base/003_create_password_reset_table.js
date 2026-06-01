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

  async columnExists(sql, tableName, columnName) {
    const result = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = ${tableName}
        AND column_name = ${columnName}
      ) as exists
    `
    return result[0]?.exists || false
  }

  down(sql) {
    throw new Error(`Down migration not implemented for migration ${this.id}`)
  }
}

export default class CreatePasswordResetTable extends BaseMigration {
  id = 3
  name = 'Create password reset requests table'

  async up(sql) {
    // Check if table already exists
    const tableExists = await this.tableExists(sql, 'password_reset_requests')
    if (tableExists) {
      console.log('📝 password_reset_requests table already exists, skipping')
      return
    }

    console.log('🔄 Creating password_reset_requests table...')
    await this.exec(sql, `
      CREATE TABLE password_reset_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires TIMESTAMP NOT NULL,
        user_id UUID NOT NULL,
        token TEXT NOT NULL UNIQUE,
        used BOOLEAN DEFAULT FALSE NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `)

    console.log('🔄 Creating indexes on password_reset_requests...')
    await this.exec(sql, `
      CREATE UNIQUE INDEX password_reset_requests_token_idx ON password_reset_requests (token)
    `)
    await this.exec(sql, `
      CREATE INDEX password_reset_requests_user_id_idx ON password_reset_requests (user_id)
    `)
    await this.exec(sql, `
      CREATE INDEX password_reset_requests_expires_idx ON password_reset_requests (expires)
    `)
    await this.exec(sql, `
      CREATE INDEX password_reset_requests_used_idx ON password_reset_requests (used)
    `)

    console.log('✅ password_reset_requests table created successfully!')
  }

  async down(sql) {
    await this.exec(sql, 'DROP TABLE IF EXISTS password_reset_requests')
  }
}
