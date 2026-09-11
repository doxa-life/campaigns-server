class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class PrayerActivityGeoMigration extends BaseMigration {
  id = 97
  name = 'Add the pray-er location to prayer_activity'

  async up(sql) {
    console.log('  Adding location columns to prayer_activity...')
    // Coordinates are stored rounded to one decimal (~11 km), so a row places a
    // prayer session in an area rather than at a person's address.
    await this.exec(sql, `
      ALTER TABLE prayer_activity
        ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS city TEXT,
        ADD COLUMN IF NOT EXISTS country TEXT
    `)
    console.log('  ✅ prayer_activity location columns added')
  }
}
