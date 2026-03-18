import { translateVerseNodes, type TiptapNode, type VerseWarning } from '#server/utils/deepl'
import { getBibleId } from '~/utils/languages'
import { getDatabase } from '#server/database/db'
import { getErrorMessage } from '#server/utils/api-helpers'

/**
 * Re-fetch Bible verse text from the Bolls Bible API for selected languages.
 * Only verses that were originally fetched from the API (attrs.translation is set)
 * are rebuilt — manually entered verses are left untouched.
 *
 * Uses Server-Sent Events (SSE) to stream progress updates.
 *
 * POST /api/admin/superadmin/rebuild-verses
 * Body: { languages: string[] }
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const body = await readBody(event)
  const { languages } = body

  if (!Array.isArray(languages) || languages.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'languages must be a non-empty array'
    })
  }

  // Validate all languages have a bibleId configured
  for (const code of languages) {
    if (!getBibleId(code)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Language "${code}" does not have a Bible translation configured`
      })
    }
  }

  // Set up SSE response
  setResponseHeader(event, 'Content-Type', 'text/event-stream')
  setResponseHeader(event, 'Cache-Control', 'no-cache')
  setResponseHeader(event, 'Connection', 'keep-alive')

  const sendEvent = (eventType: string, data: any) => {
    event.node.res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  try {
    const db = getDatabase()

    // Query all library_content rows for selected languages with non-null content
    const placeholders = languages.map((_, i) => `$${i + 1}`).join(', ')
    const rows: Array<{ id: number; language_code: string; content_json: string }> = await db.rawSql.unsafe(
      `SELECT id, language_code, content_json
       FROM library_content
       WHERE language_code IN (${placeholders})
       AND content_json IS NOT NULL
       ORDER BY language_code, library_id, day_number`,
      languages
    )

    const total = rows.length
    sendEvent('progress', {
      message: `Found ${total} content rows to process`,
      processed: 0,
      total,
      versesRebuilt: 0
    })

    const stats = { totalRows: total, rowsUpdated: 0, versesRebuilt: 0, errors: 0 }
    const allWarnings: VerseWarning[] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as { id: number; language_code: string; content_json: string }

      try {
        const originalJson = row.content_json
        const doc: TiptapNode = JSON.parse(originalJson)
        const warnings: VerseWarning[] = []

        await translateVerseNodes(doc, row.language_code, warnings, { onlyApiFetched: true })
        allWarnings.push(...warnings)

        const newJson = JSON.stringify(doc)

        if (newJson !== originalJson) {
          const versesInDoc = countVerseNodes(doc)
          stats.versesRebuilt += versesInDoc

          await db.rawSql`
            UPDATE library_content
            SET content_json = ${newJson},
                updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
            WHERE id = ${row.id}
          `
          stats.rowsUpdated++
        }
      } catch (error) {
        stats.errors++
        console.error(`[Rebuild Verses] Error processing row ${row.id}:`, getErrorMessage(error))
      }

      // Send progress every 10 rows or on last row
      if ((i + 1) % 10 === 0 || i === rows.length - 1) {
        sendEvent('progress', {
          message: `Processing ${row.language_code}...`,
          language: row.language_code,
          processed: i + 1,
          total,
          versesRebuilt: stats.versesRebuilt
        })
      }
    }

    sendEvent('complete', {
      success: stats.errors === 0,
      stats,
      warnings: allWarnings.slice(0, 20)
    })
  } catch (error) {
    sendEvent('error', {
      message: getErrorMessage(error)
    })
  } finally {
    event.node.res.end()
  }
})

/** Count verse nodes in a Tiptap document that have both reference and translation attrs */
function countVerseNodes(node: TiptapNode): number {
  let count = 0
  if (node.type === 'verse' && node.attrs?.reference && node.attrs?.translation) {
    count++
  }
  if (node.content) {
    for (const child of node.content) {
      count += countVerseNodes(child)
    }
  }
  return count
}
