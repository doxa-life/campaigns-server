class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class TextToJsonbMigration extends BaseMigration {
  id = 53
  name = 'Convert TEXT JSON columns to JSONB and drop legacy prayer_content table'

  async up(sql) {
    console.log('  Converting library_content.content_json to JSONB...')
    await this.exec(sql, `
      ALTER TABLE library_content
      ALTER COLUMN content_json TYPE jsonb USING content_json::jsonb
    `)

    console.log('  Converting people_groups.metadata to JSONB...')
    await this.exec(sql, `
      ALTER TABLE people_groups
      ALTER COLUMN metadata TYPE jsonb USING COALESCE(metadata::jsonb, '{}'::jsonb)
    `)

    console.log('  Converting marketing_emails.content_json to JSONB...')
    await this.exec(sql, `
      ALTER TABLE marketing_emails
      ALTER COLUMN content_json TYPE jsonb USING content_json::jsonb
    `)

    console.log('  Dropping legacy prayer_content table...')
    await this.exec(sql, `DROP TABLE IF EXISTS prayer_content`)
  }
}
