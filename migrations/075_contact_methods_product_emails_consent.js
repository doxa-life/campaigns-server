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

export default class ProductEmailsConsentMigration extends BaseMigration {
  id = 75
  name = 'Add product-emails consent to contact_methods'

  async up(sql) {
    console.log('📥 Adding product-emails consent column...')

    // Product/feedback emails (surveys, evaluations, product updates) are a
    // service tier distinct from the opt-in marketing consents: contacts are
    // auto opted-in (DEFAULT true) and can opt out of the whole category.
    if (!(await this.columnExists(sql, 'contact_methods', 'consent_product_emails'))) {
      await this.exec(sql, `
        ALTER TABLE contact_methods
        ADD COLUMN consent_product_emails BOOLEAN NOT NULL DEFAULT true
      `)
      await this.exec(sql, `
        ALTER TABLE contact_methods
        ADD COLUMN consent_product_emails_at TIMESTAMP
      `)
      console.log('  ✅ Added consent_product_emails (default true) and consent_product_emails_at')
    } else {
      console.log('  ℹ️  consent_product_emails already exists')
    }

    console.log('🎉 Product-emails consent migration completed!')
  }
}
