class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class ImbPeopleGroupsMirrorMigration extends BaseMigration {
  id = 93
  name = 'Create imb_people_groups mirror table'

  async up(sql) {
    // Local mirror of the IMB peoplegroups.org CSV, refreshed by the
    // imb-sync scheduler. Powers the /updates add-flow search picker.
    // `raw` keeps the full CSV row for prefill of fields without a column.
    await this.exec(sql, `
      CREATE TABLE IF NOT EXISTS imb_people_groups (
        peid TEXT PRIMARY KEY,
        pgid TEXT,
        name TEXT NOT NULL,
        country TEXT,
        country_code TEXT,
        region TEXT,
        subregion TEXT,
        population BIGINT,
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        primary_religion TEXT,
        primary_language TEXT,
        engagement_status TEXT,
        gsec INTEGER,
        is_diaspora BOOLEAN NOT NULL DEFAULT false,
        photo_url TEXT,
        raw JSONB NOT NULL DEFAULT '{}',
        synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    await this.exec(sql, 'CREATE INDEX IF NOT EXISTS idx_imb_pg_name ON imb_people_groups(name)')
    await this.exec(sql, 'CREATE INDEX IF NOT EXISTS idx_imb_pg_country_code ON imb_people_groups(country_code)')
  }
}
