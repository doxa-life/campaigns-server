class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }

  async tableExists(sql, table) {
    const result = await sql`
      SELECT 1 FROM information_schema.tables WHERE table_name = ${table}
    `
    return result.length > 0
  }
}

export default class PeopleGroupImageCopiesMigration extends BaseMigration {
  id = 118
  name = 'Compressed copies of people group photos for the mobile app'

  async up(sql) {
    // One row per distinct people group photo URL. Kept apart from
    // people_groups so the copies never touch a record, its activity log, or
    // anything the website and admin read. A row with copy_url NULL and
    // failed_at set is a download that failed and is retried a day later.
    if (!(await this.tableExists(sql, 'people_group_image_copies'))) {
      await this.exec(sql, `
        CREATE TABLE people_group_image_copies (
          source_url TEXT PRIMARY KEY,
          copy_url TEXT,
          failed_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
    }
  }
}
