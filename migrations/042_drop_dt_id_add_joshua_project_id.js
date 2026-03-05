class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class DropDtIdAddJoshuaProjectId extends BaseMigration {
  id = 42
  name = 'Drop people_desc and dt_id, add joshua_project_id'

  async up(sql) {
    // Drop dead people_desc column (data migrated to descriptions->'en' in migration 033)
    await this.exec(sql, `ALTER TABLE people_groups DROP COLUMN IF EXISTS people_desc`)
    console.log('✅ Dropped people_desc column')

    // Drop dt_id unique constraint/index, then the column
    await this.exec(sql, `ALTER TABLE people_groups DROP CONSTRAINT IF EXISTS people_groups_dt_id_key`)
    await this.exec(sql, `DROP INDEX IF EXISTS idx_people_groups_dt_id`)
    await this.exec(sql, `ALTER TABLE people_groups DROP COLUMN IF EXISTS dt_id`)
    console.log('✅ Dropped dt_id column and its constraints')

    // Add joshua_project_id column
    await this.exec(sql, `ALTER TABLE people_groups ADD COLUMN joshua_project_id TEXT`)
    await this.exec(sql, `CREATE UNIQUE INDEX idx_people_groups_joshua_project_id ON people_groups (joshua_project_id) WHERE joshua_project_id IS NOT NULL`)
    console.log('✅ Added joshua_project_id column with unique index')
  }
}
