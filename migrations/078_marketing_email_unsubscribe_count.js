class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
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
}

export default class MarketingEmailUnsubscribeCountMigration extends BaseMigration {
  id = 78
  name = 'Add unsubscribe_count column to marketing_emails'

  async up(sql) {
    console.log('📥 Adding unsubscribe_count column to marketing_emails...')

    const exists = await this.columnExists(sql, 'marketing_emails', 'unsubscribe_count')
    if (!exists) {
      await this.exec(sql, `
        ALTER TABLE marketing_emails
        ADD COLUMN unsubscribe_count INTEGER DEFAULT 0
      `)
      console.log('  ✅ Added unsubscribe_count column')
    } else {
      console.log('  ℹ️  unsubscribe_count column already exists')
    }

    console.log('🎉 Marketing email unsubscribe_count migration completed!')
  }
}
