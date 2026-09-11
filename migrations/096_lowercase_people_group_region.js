class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class LowercasePeopleGroupRegionMigration extends BaseMigration {
  id = 96
  name = 'Lowercase region on people_groups and the IMB mirror'

  async up(sql) {
    console.log('  Lowercasing region values...')
    // Region is keyed by lowercase option values (africa, asia, ...). The IMB
    // export capitalizes them, and a capitalized value never matches the
    // region filter or resolves to a label.
    await this.exec(sql, `
      UPDATE people_groups SET region = LOWER(region)
      WHERE region IS NOT NULL AND region <> LOWER(region)
    `)
    await this.exec(sql, `
      UPDATE imb_people_groups SET region = LOWER(region)
      WHERE region IS NOT NULL AND region <> LOWER(region)
    `)
    console.log('  ✅ Region values lowercased')
  }
}
