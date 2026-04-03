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

export default class MultiRoleSupportMigration extends BaseMigration {
  id = 60
  name = 'Multi-role support'

  async up(sql) {
    // 1. Add roles array column to users table
    const hasRoles = await this.columnExists(sql, 'users', 'roles')
    if (!hasRoles) {
      console.log('  Adding roles column to users...')
      await this.exec(sql, `ALTER TABLE users ADD COLUMN roles TEXT[] DEFAULT '{}'`)

      // Migrate existing role data
      await this.exec(sql, `UPDATE users SET roles = ARRAY[role] WHERE role IS NOT NULL`)

      // Drop old CHECK constraint and column
      await this.exec(sql, `ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`)
      await this.exec(sql, `ALTER TABLE users DROP COLUMN IF EXISTS role`)
      console.log('  ✅ Users table migrated to roles array')
    }

    // 2. Add roles array column to user_invitations table
    const invHasRoles = await this.columnExists(sql, 'user_invitations', 'roles')
    if (!invHasRoles) {
      console.log('  Adding roles column to user_invitations...')
      await this.exec(sql, `ALTER TABLE user_invitations ADD COLUMN roles TEXT[] DEFAULT '{}'`)

      // Migrate existing role data
      await this.exec(sql, `UPDATE user_invitations SET roles = ARRAY[role] WHERE role IS NOT NULL`)

      // Drop old CHECK constraint and column
      await this.exec(sql, `ALTER TABLE user_invitations DROP CONSTRAINT IF EXISTS user_invitations_role_check`)
      await this.exec(sql, `ALTER TABLE user_invitations DROP COLUMN IF EXISTS role`)
      console.log('  ✅ User invitations table migrated to roles array')
    }

    // 3. Create user_languages scoping table
    console.log('  Creating user_languages table...')
    await this.exec(sql, `
      CREATE TABLE IF NOT EXISTS user_languages (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        language_code TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, language_code)
      )
    `)
    console.log('  ✅ user_languages table created')

    console.log('🎉 Multi-role support migration completed!')
  }

  async down(sql) {
    // Reverse: add back single role column, drop roles array
    const hasRole = await this.columnExists(sql, 'users', 'role')
    if (!hasRole) {
      await this.exec(sql, `ALTER TABLE users ADD COLUMN role TEXT DEFAULT NULL`)
      await this.exec(sql, `UPDATE users SET role = roles[1] WHERE array_length(roles, 1) > 0`)
      await this.exec(sql, `ALTER TABLE users DROP COLUMN IF EXISTS roles`)
      await this.exec(sql, `ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'people_group_editor'))`)
    }

    const invHasRole = await this.columnExists(sql, 'user_invitations', 'role')
    if (!invHasRole) {
      await this.exec(sql, `ALTER TABLE user_invitations ADD COLUMN role TEXT DEFAULT NULL`)
      await this.exec(sql, `UPDATE user_invitations SET role = roles[1] WHERE array_length(roles, 1) > 0`)
      await this.exec(sql, `ALTER TABLE user_invitations DROP COLUMN IF EXISTS roles`)
      await this.exec(sql, `ALTER TABLE user_invitations ADD CONSTRAINT user_invitations_role_check CHECK (role IN ('admin', 'people_group_editor'))`)
    }

    await this.exec(sql, `DROP TABLE IF EXISTS user_languages`)
  }
}
