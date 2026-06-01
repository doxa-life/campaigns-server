class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class AddSubscriberSourcesMigration extends BaseMigration {
  id = 56
  name = 'Add sources array to subscribers'

  async up(sql) {
    console.log('  Adding sources column to subscribers...')
    await this.exec(sql, `
      ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS sources TEXT[] NOT NULL DEFAULT '{}'
    `)

    console.log('  Backfilling sources from activity_logs...')
    await this.exec(sql, `
      UPDATE subscribers s SET sources = sub.source_list
      FROM (
        SELECT record_id::int AS id,
               ARRAY_AGG(DISTINCT
                 CASE metadata->>'source'
                   WHEN 'Contact Form' THEN 'contact'
                   WHEN 'Adoption Form' THEN 'adoption'
                   WHEN 'Signup Form' THEN 'signup'
                   ELSE metadata->>'source'
                 END
               ) AS source_list
        FROM activity_logs
        WHERE table_name = 'subscribers'
          AND metadata->>'source' IS NOT NULL
        GROUP BY record_id
      ) sub
      WHERE s.id = sub.id
    `)
    console.log('  ✅ Sources column added and backfilled')
  }
}
