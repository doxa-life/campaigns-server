class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class PeopleGroupAdoptionsMigration extends BaseMigration {
  id = 46
  name = 'Create people_group_adoptions table'

  async up(sql) {
    await this.exec(sql, `
      CREATE TABLE IF NOT EXISTS people_group_adoptions (
        id SERIAL PRIMARY KEY,
        people_group_id INTEGER NOT NULL REFERENCES people_groups(id),
        group_id INTEGER NOT NULL REFERENCES groups(id),
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'inactive')),
        update_token UUID NOT NULL DEFAULT gen_random_uuid(),
        show_publicly BOOLEAN DEFAULT false,
        adopted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(people_group_id, group_id)
      )
    `)

    await this.exec(sql, 'CREATE INDEX IF NOT EXISTS idx_adoptions_people_group ON people_group_adoptions(people_group_id)')
    await this.exec(sql, 'CREATE INDEX IF NOT EXISTS idx_adoptions_group ON people_group_adoptions(group_id)')
    await this.exec(sql, 'CREATE UNIQUE INDEX IF NOT EXISTS idx_adoptions_update_token ON people_group_adoptions(update_token)')
  }
}
