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

export default class ContactMethodVerificationLastSentMigration extends BaseMigration {
  id = 89
  name = 'Contact method verification last sent'

  async up(sql) {
    console.log('📥 Adding verification_last_sent_at to contact_methods...')

    // Records when a verification email was last dispatched for the address, so the
    // resend endpoint can enforce a cooldown (the reused token gives no send time).
    if (!(await this.columnExists(sql, 'contact_methods', 'verification_last_sent_at'))) {
      await this.exec(sql, `
        ALTER TABLE contact_methods
          ADD COLUMN verification_last_sent_at TIMESTAMP
      `)
      console.log('  ✅ Added verification_last_sent_at')
    } else {
      console.log('  ℹ️  verification_last_sent_at already exists')
    }

    console.log('🎉 Contact method verification last sent migration completed!')
  }
}
