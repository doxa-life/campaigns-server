import { writeLanguageNotes } from '#server/database/glossary'
import { requireReviewPass, limitReviewWrites } from '#server/utils/glossary-review'
import { GLOSSARY_NOTES_MAX_LENGTH } from '../../../../../config/glossary-chrome'
import { clearGlossaryCache } from '#server/utils/openrouter'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * PATCH /api/glossary/review/:token/notes — the reviewer's rules for the whole
 * language. Body: { notes }
 *
 * A reviewer knows things no single term can hold — how the reader is
 * addressed, which acronyms translate, how numbers are written — and this is
 * where they record them. The text reaches every machine translation, so the
 * name on the pass is required first, exactly as for a term.
 */
export default defineEventHandler(async (event) => {
  try {
    const { pass, language } = await requireReviewPass(event)
    await limitReviewWrites(event, pass)

    if (!pass.reviewer_name) {
      throw createError({ statusCode: 400, statusMessage: 'Please enter your name before making changes' })
    }

    const body = await readBody<{ notes?: string }>(event)
    const notes = (body?.notes ?? '').trim()
    if (notes.length > GLOSSARY_NOTES_MAX_LENGTH) {
      throw createError({
        statusCode: 400,
        statusMessage: `Please keep these notes under ${GLOSSARY_NOTES_MAX_LENGTH} characters — a point about one term belongs in that term's notes`
      })
    }
    if (notes === language.notes) return { notes }

    const updated = await writeLanguageNotes(language.id, notes, {
      name: pass.reviewer_name,
      passId: pass.id,
      source: 'review'
    })
    clearGlossaryCache(language.code)
    return { notes: updated?.notes ?? '' }
  } catch (error) {
    handleApiError(error, 'Failed to save your notes', 400)
  }
})
