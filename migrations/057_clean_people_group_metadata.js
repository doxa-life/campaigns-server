class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class CleanPeopleGroupMetadataMigration extends BaseMigration {
  id = 57
  name = 'Sync metadata to columns and strip duplicates from people_groups'

  async up(sql) {
    // First, ensure columns have the latest values from metadata
    // (metadata may have been edited after migration 033 copied data to columns)
    console.log('  Syncing metadata values to table columns...')
    await this.exec(sql, `
      UPDATE people_groups
      SET
        country_code = COALESCE(country_code, (metadata::jsonb)->>'imb_isoalpha3'),
        region = COALESCE(region, (metadata::jsonb)->>'imb_region'),
        latitude = COALESCE(latitude, ((metadata::jsonb)->>'imb_lat')::DECIMAL(10, 8)),
        longitude = COALESCE(longitude, ((metadata::jsonb)->>'imb_lng')::DECIMAL(11, 8)),
        population = COALESCE(population, ((metadata::jsonb)->>'imb_population')::INTEGER),
        evangelical_pct = COALESCE(evangelical_pct, ((metadata::jsonb)->>'imb_evangelical_percentage')::DECIMAL(5, 2)),
        engagement_status = COALESCE(engagement_status, (metadata::jsonb)->>'imb_engagement_status'),
        primary_religion = COALESCE(primary_religion, (metadata::jsonb)->>'imb_reg_of_religion'),
        primary_language = COALESCE(primary_language, (metadata::jsonb)->>'imb_reg_of_language')
      WHERE metadata IS NOT NULL
    `)

    // Strip all column-duplicate keys from metadata
    console.log('  Removing column-duplicate keys from metadata...')
    await this.exec(sql, `
      UPDATE people_groups
      SET metadata = metadata
        - 'name'
        - 'image_url'
        - 'joshua_project_id'
        - 'descriptions'
        - 'imb_isoalpha3'
        - 'imb_region'
        - 'imb_lat'
        - 'imb_lng'
        - 'imb_population'
        - 'imb_evangelical_percentage'
        - 'imb_engagement_status'
        - 'imb_reg_of_religion'
        - 'imb_reg_of_language'
      WHERE metadata IS NOT NULL
    `)

    console.log('  ✅ People group metadata cleaned')
  }
}
