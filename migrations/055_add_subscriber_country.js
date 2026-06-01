class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class AddSubscriberCountryMigration extends BaseMigration {
  id = 55
  name = 'Add country to subscribers'

  async up(sql) {
    console.log('  Adding country column to subscribers...')
    await this.exec(sql, `
      ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS country TEXT
    `)
    console.log('  ✅ Country column added to subscribers')
  }
}
