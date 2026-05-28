/**
 * Backfill the `translation` attribute on all English verse nodes.
 *
 * Usage:  bun run scripts/backfill-verse-translation.ts [--dry-run]
 */
import postgres from 'postgres'

const dryRun = process.argv.includes('--dry-run')
const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const sql = postgres(DATABASE_URL)
const TRANSLATION = 'NKJV'

function addTranslationToVerses(node: any): boolean {
  let changed = false
  if (node.type === 'verse' && node.attrs?.reference && !node.attrs.translation) {
    node.attrs.translation = TRANSLATION
    changed = true
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      if (addTranslationToVerses(child)) changed = true
    }
  }
  return changed
}

async function main() {
  const rows = await sql`
    SELECT id, day_number, content_json
    FROM library_content
    WHERE language_code = 'en'
      AND content_json::text LIKE '%"type":"verse"%'
  `

  let updated = 0
  for (const row of rows) {
    const doc = typeof row.content_json === 'string'
      ? JSON.parse(row.content_json)
      : row.content_json

    if (addTranslationToVerses(doc)) {
      if (!dryRun) {
        await sql`
          UPDATE library_content
          SET content_json = ${JSON.stringify(doc)}
          WHERE id = ${row.id}
        `
      }
      updated++
      console.log(`${dryRun ? '[DRY RUN] ' : ''}Updated id=${row.id} day=${row.day_number}`)
    }
  }

  console.log(`\nDone. ${updated} rows ${dryRun ? 'would be ' : ''}updated out of ${rows.length} checked.`)
  await sql.end()
}

main().catch(e => { console.error(e); process.exit(1) })
