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

export default class AddPeopleGroupStatusMigration extends BaseMigration {
  id = 59
  name = 'Add status column to people_groups'

  async up(sql) {
    const exists = await this.columnExists(sql, 'people_groups', 'status')
    if (!exists) {
      await this.exec(sql, `
        ALTER TABLE people_groups
        ADD COLUMN status TEXT DEFAULT 'active'
      `)
      await this.exec(sql, `
        UPDATE people_groups SET status = 'active' WHERE status IS NULL
      `)
      await this.exec(sql, `
        CREATE INDEX idx_people_groups_status ON people_groups(status)
      `)
      console.log('  ✅ Added status column to people_groups')
    } else {
      console.log('  ℹ️  status column already exists')
    }
  }
}
