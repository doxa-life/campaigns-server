class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }

  async columnExists(sql, table, column) {
    const result = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}
      ) as exists
    `
    return result[0]?.exists || false
  }
}

export default class MarketingAudiencesMigration extends BaseMigration {
  id = 71
  name = 'Add doxa_active_pg and pick marketing audiences'

  async up(sql) {
    console.log('📥 Extending marketing audience options...')

    // Widen the audience_type constraint to allow the two new audiences.
    await this.exec(sql, `
      ALTER TABLE marketing_emails
      DROP CONSTRAINT IF EXISTS marketing_emails_audience_type_check
    `)
    await this.exec(sql, `
      ALTER TABLE marketing_emails
      ADD CONSTRAINT marketing_emails_audience_type_check
      CHECK (audience_type IN ('doxa', 'people_group', 'admins', 'doxa_active_pg', 'pick'))
    `)
    console.log('  ✅ audience_type now allows doxa, people_group, admins, doxa_active_pg, pick')

    // Hand-picked recipients (audience_type = 'pick') are stored as contact_method ids.
    if (!(await this.columnExists(sql, 'marketing_emails', 'recipient_contact_method_ids'))) {
      await this.exec(sql, `
        ALTER TABLE marketing_emails
        ADD COLUMN recipient_contact_method_ids INTEGER[]
      `)
      console.log('  ✅ Added recipient_contact_method_ids column')
    } else {
      console.log('  ℹ️  recipient_contact_method_ids column already exists')
    }

    console.log('🎉 Marketing audiences migration completed!')
  }
}
