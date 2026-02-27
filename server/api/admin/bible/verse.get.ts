import { parseReference, localizeReference } from '../../../../config/bible-books'
import { fetchVerseText, isBollsBibleConfigured } from '#server/utils/app/bolls-bible'
import { getBibleId, getBibleLabel } from '~/utils/languages'

/**
 * Fetch verse text from Bolls Bible API
 *
 * GET /api/admin/bible/verse?reference=John+3:16&language=en
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'content.create')

  const query = getQuery(event)
  const reference = String(query.reference || '').trim()
  const language = String(query.language || 'en').trim()

  if (!reference) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Reference query parameter is required (e.g., ?reference=John+3:16)'
    })
  }

  const parsed = parseReference(reference)
  if (!parsed) {
    throw createError({
      statusCode: 400,
      statusMessage: `Could not parse reference: "${reference}". Use format like "John 3:16" or "1 Corinthians 13:4-7".`
    })
  }

  const bibleId = getBibleId(language)
  if (!isBollsBibleConfigured(bibleId)) {
    throw createError({
      statusCode: 400,
      statusMessage: `No Bible configured for language: ${language}`
    })
  }

  const text = await fetchVerseText({
    bibleId: bibleId!,
    bookId: parsed.bookId,
    chapter: parsed.chapter,
    verseStart: parsed.verseStart,
    verseEnd: parsed.verseEnd
  })

  return {
    reference: localizeReference(parsed, 'en'),
    text,
    language,
    translation: getBibleLabel(language)
  }
})
