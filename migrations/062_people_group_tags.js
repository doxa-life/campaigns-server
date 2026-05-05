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

export default class PeopleGroupTagsMigration extends BaseMigration {
  id = 62
  name = 'Add tags column to people_groups'

  async up(sql) {
    const exists = await this.columnExists(sql, 'people_groups', 'tags')
    if (!exists) {
      await this.exec(sql, `
        ALTER TABLE people_groups
        ADD COLUMN tags JSONB NOT NULL DEFAULT '[]'::jsonb
      `)
    }

    await this.exec(sql, `
      CREATE INDEX IF NOT EXISTS idx_people_groups_tags
      ON people_groups USING GIN (tags)
    `)
  }
}
