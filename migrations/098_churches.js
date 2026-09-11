class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class ChurchesMigration extends BaseMigration {
  id = 98
  name = 'Create churches table'

  async up(sql) {
    console.log('  Creating churches table...')
    // country is an ISO 3166 alpha-2 code, like groups.country. location_status
    // holds a key resolved by code (pending | geocoded | manual | not_found);
    // NULL means the church has nothing to locate from.
    await this.exec(sql, `
      CREATE TABLE IF NOT EXISTS churches (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        town TEXT,
        country TEXT,
        pastor_name TEXT,
        pastor_phone TEXT,
        pastor_email TEXT,
        congregation_size INTEGER,
        service_language TEXT,
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        location_status TEXT,
        geocode_attempts INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    await this.exec(sql, 'CREATE INDEX IF NOT EXISTS idx_churches_location_status ON churches(location_status)')
    await this.exec(sql, 'CREATE INDEX IF NOT EXISTS idx_churches_name ON churches(name)')
    console.log('  ✅ churches table created')
  }
}
