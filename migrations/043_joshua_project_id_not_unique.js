class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class JoshuaProjectIdNotUnique extends BaseMigration {
  id = 43
  name = 'Change joshua_project_id from unique to non-unique index'

  async up(sql) {
    await this.exec(sql, `DROP INDEX IF EXISTS idx_people_groups_joshua_project_id`)
    await this.exec(sql, `CREATE INDEX idx_people_groups_joshua_project_id ON people_groups (joshua_project_id) WHERE joshua_project_id IS NOT NULL`)
    console.log('Replaced unique index on joshua_project_id with non-unique index')
  }
}
