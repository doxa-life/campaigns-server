class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class ConvertAvailabilityToBooleanMigration extends BaseMigration {
  id = 58
  name = 'Convert IMB resource availability metadata fields from string to boolean'

  async up(sql) {
    const fields = [
      'imb_bible_available',
      'imb_jesus_film_available',
      'imb_audio_scripture_available',
      'imb_bible_stories_available',
      'imb_gospel_recordings_available',
      'imb_radio_broadcast_available'
    ]

    for (const field of fields) {
      console.log(`  Converting ${field} to boolean...`)
      await this.exec(sql, `
        UPDATE people_groups
        SET metadata = jsonb_set(
          metadata::jsonb,
          '{${field}}',
          CASE WHEN (metadata::jsonb)->>'${field}' = '1' THEN 'true'::jsonb ELSE 'false'::jsonb END
        )
        WHERE metadata IS NOT NULL
          AND (metadata::jsonb)->>'${field}' IS NOT NULL
      `)
    }

    console.log('  ✅ Availability fields converted to boolean')
  }
}
