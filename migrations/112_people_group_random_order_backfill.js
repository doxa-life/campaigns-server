class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

export default class PeopleGroupRandomOrderBackfillMigration extends BaseMigration {
  id = 112
  name = 'Give every people group a rotation slot'

  async up(sql) {
    // A group without a random_order sits outside the daily people-group
    // rotation: it is never shown to anyone, and its own subscribers get no
    // rotation content at all. Inserts take the next free slot, so this
    // covers the rows that predate that.
    const rows = await sql`SELECT id FROM people_groups WHERE random_order IS NULL ORDER BY id`
    if (rows.length === 0) return

    const [{ max }] = await sql`SELECT COALESCE(MAX(random_order), 0) AS max FROM people_groups`
    const start = Number(max) + 1
    const shuffled = this.shuffleArray(rows.map(row => row.id))

    for (let i = 0; i < shuffled.length; i++) {
      await sql`
        UPDATE people_groups
        SET random_order = ${start + i}
        WHERE id = ${shuffled[i]}
      `
    }

    console.log(`  Assigned rotation slots ${start}-${start + shuffled.length - 1} to ${shuffled.length} people groups`)
  }

  // Fisher-Yates shuffle
  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[array[i], array[j]] = [array[j], array[i]]
    }
    return array
  }
}
