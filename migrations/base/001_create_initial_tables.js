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

export default class CreateInitialTables extends BaseMigration {
  id = 1
  name = 'Create initial users and activity_logs tables'

  async up(sql) {
    // Check if users table already exists
    const usersTableExists = await this.tableExists(sql, 'users')
    if (!usersTableExists) {
      console.log('🔄 Creating users table...')
      await this.exec(sql, `
        CREATE TABLE users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          created TIMESTAMPTZ DEFAULT NOW(),
          updated TIMESTAMPTZ DEFAULT NOW(),
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          verified BOOLEAN DEFAULT FALSE,
          superadmin BOOLEAN DEFAULT FALSE,
          display_name TEXT NOT NULL,
          avatar TEXT DEFAULT '',
          token_key UUID DEFAULT gen_random_uuid(),
          email_visibility BOOLEAN DEFAULT FALSE
        )
      `)
      console.log('✅ Users table created successfully!')
    } else {
      console.log('📝 Users table already exists, skipping')
    }

    // Check if activity_logs table already exists
    const activityLogsTableExists = await this.tableExists(sql, 'activity_logs')
    if (!activityLogsTableExists) {
      console.log('🔄 Creating activity_logs table...')
      await this.exec(sql, `
        CREATE TABLE activity_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          timestamp BIGINT NOT NULL,
          event_type TEXT NOT NULL,
          table_name TEXT,
          record_id TEXT,
          user_id UUID,
          user_agent TEXT,
          metadata JSONB DEFAULT '{}'::jsonb
        )
      `)
      console.log('✅ Activity_logs table created successfully!')
    } else {
      console.log('📝 Activity_logs table already exists, skipping')
    }

    // Create indexes
    console.log('🔄 Creating indexes...')

    // Index on activity_logs for better query performance
    await this.exec(sql, `
      CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp
      ON activity_logs(timestamp DESC)
    `)

    await this.exec(sql, `
      CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id
      ON activity_logs(user_id)
    `)

    await this.exec(sql, `
      CREATE INDEX IF NOT EXISTS idx_activity_logs_event_type
      ON activity_logs(event_type)
    `)

    console.log('✅ Indexes created successfully!')
  }

  async down(sql) {
    await this.exec(sql, 'DROP TABLE IF EXISTS activity_logs')
    await this.exec(sql, 'DROP TABLE IF EXISTS users')
    console.log('✅ Dropped users and activity_logs tables')
  }
}
