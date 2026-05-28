#!/usr/bin/env tsx
/**
 * Fix multi-line verse references in library content.
 * Splits a single verse node with multiple newline-separated references
 * into multiple verse nodes, each with its own reference and fetched verse text.
 *
 * Usage: bun run scripts/fix-multiline-verses.ts
 *   DRY_RUN=true bun run scripts/fix-multiline-verses.ts
 */

import postgres from 'postgres'
import { readFileSync } from 'fs'
import { join } from 'path'
import { fetchVerseData } from '../server/utils/app/bolls-bible'
import { parseReference, localizeReference } from '../config/bible-books'
import { getBibleId, getBibleLabel } from '../app/utils/languages'

function loadEnv() {
  try {
    const envPath = join(process.cwd(), '.env')
    const envContent = readFileSync(envPath, 'utf-8')
    envContent.split('\n').forEach(line => {
      if (!line || line.trim().startsWith('#')) return
      const [key, ...valueParts] = line.split('=')
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join('=').trim()
      }
    })
  } catch (error) {
    console.warn('Could not load .env file:', error)
  }
}

loadEnv()

const LIBRARY_ID = 3
const DRY_RUN = process.env.DRY_RUN === 'true'

async function buildVerseNode(reference: string, languageCode: string) {
  const parsed = parseReference(reference)
  if (!parsed) {
    console.warn(`    Could not parse: "${reference}"`)
    return null
  }

  const bibleId = getBibleId(languageCode)
  if (!bibleId) {
    console.warn(`    No Bible for language: ${languageCode}`)
    return null
  }

  try {
    const verses = await fetchVerseData({
      bibleId,
      bookId: parsed.bookId,
      chapter: parsed.chapter,
      verseStart: parsed.verseStart,
      verseEnd: parsed.verseEnd,
    })

    const content: any[] = []
    verses.forEach((v, i) => {
      content.push({ type: 'text', text: `${v.verse} `, marks: [{ type: 'superscript' }] })
      content.push({ type: 'text', text: i < verses.length - 1 ? v.text + ' ' : v.text })
    })

    return {
      type: 'verse',
      attrs: {
        reference: localizeReference(parsed, 'en'),
        translation: getBibleLabel(languageCode),
      },
      content: [{ type: 'paragraph', content }],
    }
  } catch (err: any) {
    console.warn(`    Failed to fetch "${reference}" for ${languageCode}: ${err.message}`)
    return null
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL not found in .env')
    process.exit(1)
  }

  const sql = postgres(databaseUrl, { max: 5 })

  try {
    await sql`SELECT NOW()`
    console.log('Database connected')

    if (DRY_RUN) console.log('--- DRY RUN ---\n')

    // Find all rows with multi-line verse references
    const rows = await sql`
      SELECT id, day_number, language_code, content_json
      FROM library_content
      WHERE library_id = ${LIBRARY_ID}
      AND content_json::text ~ ${'"reference": "[^"]*\\\\n'}
      ORDER BY day_number, language_code
    `

    console.log(`Found ${rows.length} rows with multi-line verse references\n`)

    let fixed = 0
    let failed = 0

    for (const row of rows) {
      const contentJson = row.content_json
      if (!contentJson?.content) continue

      console.log(`Day ${row.day_number} (${row.language_code}, id: ${row.id})`)

      let changed = false
      const newContent: any[] = []

      for (const node of contentJson.content) {
        if (node.type !== 'verse' || !node.attrs?.reference?.includes('\n')) {
          newContent.push(node)
          continue
        }

        // Split multi-line reference into individual verse nodes
        const refs = node.attrs.reference.split('\n').map((r: string) => r.trim()).filter(Boolean)
        console.log(`  Splitting "${refs.join(' | ')}" into ${refs.length} verse nodes`)

        for (const ref of refs) {
          const verseNode = await buildVerseNode(ref, row.language_code)
          if (verseNode) {
            newContent.push(verseNode)
            console.log(`    + ${verseNode.attrs.reference}`)
          } else {
            // Keep a placeholder verse node with empty content
            newContent.push({
              type: 'verse',
              attrs: { reference: ref, translation: node.attrs.translation },
              content: [{ type: 'paragraph', content: [] }],
            })
            console.log(`    + ${ref} (no verse text)`)
          }
        }
        changed = true
      }

      if (!changed) continue

      contentJson.content = newContent

      if (DRY_RUN) {
        console.log(`  [DRY RUN] Would update`)
        fixed++
      } else {
        try {
          await sql`
            UPDATE library_content
            SET content_json = ${sql.json(contentJson)},
                updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
            WHERE id = ${row.id}
          `
          console.log(`  Updated`)
          fixed++
        } catch (err: any) {
          console.error(`  FAILED: ${err.message}`)
          failed++
        }
      }
    }

    console.log(`\nDone! Fixed: ${fixed}, Failed: ${failed}`)
  } finally {
    await sql.end()
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
