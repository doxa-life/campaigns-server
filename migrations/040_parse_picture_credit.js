class BaseMigration {
  async exec(sql, query) {
    await sql.unsafe(query)
  }
}

/**
 * Parse HTML credit string into structured segments array.
 * Returns null for "No photo available" or empty strings.
 */
function parseCreditHtml(html) {
  if (!html || html.includes('No photo available')) return null

  // Strip <div ...> wrappers
  let text = html.replace(/<\/?div[^>]*>/g, '')

  // Fix malformed double-quoted URLs: href=""url"" → href="url"
  text = text.replace(/href=""+/g, 'href="').replace(/""+/g, '"')

  const segments = []
  let remaining = text

  while (remaining.length > 0) {
    const linkStart = remaining.indexOf('<a ')
    if (linkStart === -1) {
      // No more links — rest is plain text
      const plain = remaining.trim()
      if (plain) segments.push({ text: plain, link: null })
      break
    }

    // Plain text before the link
    if (linkStart > 0) {
      const before = remaining.substring(0, linkStart)
      if (before.trim()) segments.push({ text: before, link: null })
    }

    // Extract href
    const hrefMatch = remaining.substring(linkStart).match(/href="([^"]*)"/)
    const href = hrefMatch ? hrefMatch[1] : null

    // Extract link text (between > and </a>)
    const gtPos = remaining.indexOf('>', linkStart)
    const closePos = remaining.indexOf('</a>', linkStart)
    if (gtPos === -1 || closePos === -1) {
      // Malformed — treat rest as plain text
      const rest = remaining.substring(linkStart).replace(/<[^>]*>/g, '').trim()
      if (rest) segments.push({ text: rest, link: null })
      break
    }

    const linkText = remaining.substring(gtPos + 1, closePos).trim()
    if (linkText) segments.push({ text: linkText, link: href })

    remaining = remaining.substring(closePos + 4) // after </a>
  }

  return segments.length > 0 ? segments : null
}

export default class ParsePictureCredit extends BaseMigration {
  id = 40
  name = 'Parse picture credit HTML into structured JSON'

  async up(sql) {
    console.log('📸 Parsing picture credit HTML...')

    const rows = await sql`
      SELECT id, metadata::json->>'imb_picture_credit_html' as credit_html
      FROM people_groups
      WHERE metadata::json->>'imb_picture_credit_html' IS NOT NULL
        AND metadata::json->>'imb_picture_credit_html' != ''
    `

    let updated = 0
    let skipped = 0

    for (const row of rows) {
      const parsed = parseCreditHtml(row.credit_html)

      if (!parsed) {
        skipped++
        continue
      }

      await sql`
        UPDATE people_groups
        SET metadata = jsonb_set(
          COALESCE(metadata::jsonb, '{}'::jsonb),
          '{picture_credit}',
          ${sql.json(parsed)}::jsonb
        )
        WHERE id = ${row.id}
      `

      updated++
    }

    console.log(`  ✅ Parsed ${updated} picture credits, skipped ${skipped} (no photo / empty)`)
    console.log('🎉 Picture credit parsing migration completed!')
  }
}
