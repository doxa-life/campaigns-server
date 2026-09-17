import { updateLanguage } from '#server/database/glossary'
import { requireReviewPass, limitReviewWrites } from '#server/utils/glossary-review'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * PATCH /api/glossary/review/:token/bible — record the Bible translation this
 * language's biblical wording follows.
 * Body: { bible_id?, bible_translation?, bible_translation_note? }
 *
 * It belongs to the language rather than to the reviewer: every biblical phrase
 * in the glossary is aligned to one translation.
 */
export default defineEventHandler(async (event) => {
  try {
    const { pass, language } = await requireReviewPass(event)
    await limitReviewWrites(event, pass)

    const body = await readBody<{
      bible_id?: string | null
      bible_translation?: string | null
      bible_translation_note?: string | null
    }>(event)

    const updated = await updateLanguage(language.id, {
      bible_id: body?.bible_id === undefined ? undefined : body.bible_id || null,
      bible_translation: body?.bible_translation === undefined ? undefined : body.bible_translation?.trim() || null,
      bible_translation_note: body?.bible_translation_note === undefined ? undefined : body.bible_translation_note?.trim() || null
    })

    return {
      bible_id: updated?.bible_id ?? null,
      bible_translation: updated?.bible_translation ?? null,
      bible_translation_note: updated?.bible_translation_note ?? null
    }
  } catch (error) {
    handleApiError(error, 'Failed to save the Bible translation', 400)
  }
})
