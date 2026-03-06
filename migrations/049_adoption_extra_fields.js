class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class AdoptionExtraFieldsMigration extends BaseMigration {
  id = 49
  name = 'Add role to subscribers'

  async up(sql) {
    await this.exec(sql, `ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS role TEXT`)
  }
}
