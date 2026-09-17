import { writeTranslation, type TranslationStatus } from '#server/database/glossary'
import { requireReviewPass, limitReviewWrites } from '#server/utils/glossary-review'
import { clearGlossaryCache } from '#server/utils/openrouter'
import { getUuidParam, handleApiError } from '#server/utils/api-helpers'

const STATUSES: TranslationStatus[] = ['draft', 'confirmed', 'flagged']

/**
 * PATCH /api/glossary/review/:token/terms/:termId — confirm, edit, note or flag
 * one term. Body: { value?, status?, note? }
 *
 * The change takes effect immediately and is recorded against the reviewer's
 * name and this pass, which is what makes it reversible.
 */
export default defineEventHandler(async (event) => {
  try {
    const { pass, language } = await requireReviewPass(event)
    await limitReviewWrites(event, pass)

    if (!pass.reviewer_name) {
      throw createError({ statusCode: 400, statusMessage: 'Please enter your name before editing terms' })
    }

    const termId = getUuidParam(event, 'termId')
    const body = await readBody<{ value?: string; status?: TranslationStatus; note?: string | null }>(event)

    if (body?.status !== undefined && !STATUSES.includes(body.status)) {
      throw createError({ statusCode: 400, statusMessage: 'status must be draft, confirmed, or flagged' })
    }
    if (body?.value !== undefined && body.value.length > 500) {
      throw createError({ statusCode: 400, statusMessage: 'A term must be at most 500 characters' })
    }
    if (body?.note != null && body.note.length > 2000) {
      throw createError({ statusCode: 400, statusMessage: 'A note must be at most 2000 characters' })
    }

    const translation = await writeTranslation(
      language.id,
      termId,
      { value: body?.value, status: body?.status, note: body?.note },
      { name: pass.reviewer_name, passId: pass.id, source: 'review' }
    )
    clearGlossaryCache(language.code)
    return translation
  } catch (error) {
    handleApiError(error, 'Failed to save the term', 400)
  }
})
