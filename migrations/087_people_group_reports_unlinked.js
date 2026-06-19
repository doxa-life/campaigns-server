class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class PeopleGroupReportsUnlinkedMigration extends BaseMigration {
  id = 87
  name = 'Allow people_group_reports for groups not yet in the system'

  async up(sql) {
    // A report may be filed for a people group we have not imported yet. Such a
    // report carries a free-text name (and optional identifier) instead of a
    // people_group_id, and can be linked to a real people group later.
    await this.exec(sql, 'ALTER TABLE people_group_reports ALTER COLUMN people_group_id DROP NOT NULL')
    await this.exec(sql, 'ALTER TABLE people_group_reports ADD COLUMN IF NOT EXISTS people_group_name TEXT')
    await this.exec(sql, 'ALTER TABLE people_group_reports ADD COLUMN IF NOT EXISTS people_group_uid TEXT')
  }
}
