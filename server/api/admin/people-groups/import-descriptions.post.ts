import { getSql } from '#server/database/db'
import { handleApiError } from '#server/utils/api-helpers'

interface ImportResult {
  success: boolean
  message: string
  stats: {
    total: number
    matched: number
    updated: number
    notFound: number
    errors: number
  }
  notFoundPeids?: string[]
}

export default defineEventHandler(async (event): Promise<ImportResult> => {
  try {
    await requirePermission(event, 'people_groups.edit')

    const formData = await readMultipartFormData(event)
    if (!formData || formData.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No file uploaded'
      })
    }

    const file = formData.find(f => f.name === 'file')
    if (!file || !file.data) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No CSV file found in request'
      })
    }

    const csvContent = file.data.toString('utf-8')
    const lines = csvContent.split('\n').filter(line => line.trim())

    if (lines.length < 2) {
      throw createError({
        statusCode: 400,
        statusMessage: 'CSV file is empty or has no data rows'
      })
    }

    // Parse header row to find PEID and PeopleDesc columns
    const headerLine = lines[0]!
    const headers = parseCSVLine(headerLine)

    const peidIndex = headers.findIndex(h => h.toLowerCase() === 'peid')
    const descIndex = headers.findIndex(h => h.toLowerCase() === 'peopledesc')

    if (peidIndex === -1) {
      throw createError({
        statusCode: 400,
        statusMessage: 'CSV must have a PEID column'
      })
    }

    if (descIndex === -1) {
      throw createError({
        statusCode: 400,
        statusMessage: 'CSV must have a PeopleDesc column'
      })
    }

    const sql = getSql()
    let matched = 0
    let updated = 0
    let notFound = 0
    let errors = 0
    const notFoundPeids: string[] = []
    const totalRows = lines.length - 1

    console.log(`📥 Starting people group description import: ${totalRows} rows to process`)

    // Process data rows
    for (let i = 1; i < lines.length; i++) {
      // Log progress every 1000 rows
      if ((i - 1) % 1000 === 0) {
        console.log(`  Processing row ${i} of ${totalRows} (${Math.round((i / totalRows) * 100)}%)`)
      }
      const line = lines[i]!.trim()
      if (!line) continue

      try {
        const values = parseCSVLine(line)
        const peid = values[peidIndex]?.trim()
        const desc = values[descIndex]?.trim()

        if (!peid) {
          errors++
          continue
        }

        // Find people group by imb_peid in metadata (metadata is stored as text, cast to jsonb)
        const [result] = await sql`
          SELECT id FROM people_groups
          WHERE metadata::jsonb->>'imb_peid' = ${peid}
        ` as { id: number }[]

        if (!result) {
          notFound++
          notFoundPeids.push(peid)
          continue
        }

        matched++

        // Update descriptions->en if we have a description
        if (desc) {
          // Log first few updates for verification
          if (updated < 3) {
            console.log(`  Found PEID ${peid} -> updating with description (${desc.substring(0, 50)}...)`)
          }
          await sql`
            UPDATE people_groups
            SET descriptions = COALESCE(descriptions, '{}'::jsonb) || jsonb_build_object('en', ${desc}::text),
                updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
            WHERE id = ${result.id}
          `
          updated++
        }
      } catch (err) {
        console.error(`Error processing row ${i + 1}:`, err)
        errors++
      }
    }

    console.log(`✅ Import completed: ${matched} matched, ${updated} updated, ${notFound} not found, ${errors} errors`)

    return {
      success: true,
      message: `Import completed: ${matched} matched, ${updated} updated, ${notFound} not found, ${errors} errors`,
      stats: {
        total: lines.length - 1,
        matched,
        updated,
        notFound,
        errors
      },
      notFoundPeids: notFoundPeids.slice(0, 50) // Limit to first 50
    }
  } catch (error) {
    handleApiError(error, 'Failed to import people group descriptions')
    throw error // TypeScript needs this for return type
  }
})

/**
 * Parse a CSV line handling quoted fields with commas
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]!
    const nextChar = line[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"'
        i++
      } else {
        // Toggle quote state
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current)
      current = ''
    } else {
      current += char
    }
  }

  values.push(current)
  return values
}
