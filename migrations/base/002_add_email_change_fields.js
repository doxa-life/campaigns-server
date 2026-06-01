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

export default class AddEmailChangeFields extends BaseMigration {
  id = 2
  name = 'Add email change fields to users'

  async up(sql) {
    // Check if pending_email column already exists
    const pendingEmailExists = await this.columnExists(sql, 'users', 'pending_email')
    const tokenExists = await this.columnExists(sql, 'users', 'email_change_token')

    if (pendingEmailExists && tokenExists) {
      console.log('📝 Email change fields already exist, skipping')
      return
    }

    // Add pending_email column if it doesn't exist
    if (!pendingEmailExists) {
      await this.exec(sql, `
        ALTER TABLE users
        ADD COLUMN pending_email TEXT
      `)
      console.log('✅ Added pending_email column to users')
    }

    // Add email_change_token column if it doesn't exist
    if (!tokenExists) {
      await this.exec(sql, `
        ALTER TABLE users
        ADD COLUMN email_change_token UUID
      `)
      console.log('✅ Added email_change_token column to users')
    }
  }

  async down(sql) {
    await this.exec(sql, `
      ALTER TABLE users
      DROP COLUMN IF EXISTS pending_email,
      DROP COLUMN IF EXISTS email_change_token
    `)
    console.log('✅ Removed email change fields from users')
  }
}
