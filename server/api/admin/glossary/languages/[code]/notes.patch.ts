import { getLanguageByCode, writeLanguageNotes } from '#server/database/glossary'
import { GLOSSARY_NOTES_MAX_LENGTH } from '../../../../../../config/glossary-chrome'
import { clearGlossaryCache } from '#server/utils/openrouter'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * PATCH /api/admin/glossary/languages/:code/notes — replace the language's
 * translation rules. Body: { notes }
 *
 * Separate from the language PATCH because every change appends a revision:
 * these rules reach every translated string, so who changed them and what they
 * said before has to survive.
 */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'glossary.manage')
  const code = getRouterParam(event, 'code') || ''
  const body = await readBody<{ notes?: string }>(event)

  try {
    const language = await getLanguageByCode(code)
    if (!language) throw createError({ statusCode: 404, statusMessage: 'Language not found' })

    const notes = (body?.notes ?? '').trim()
    if (notes.length > GLOSSARY_NOTES_MAX_LENGTH) {
      throw createError({
        statusCode: 400,
        statusMessage: `Notes must be at most ${GLOSSARY_NOTES_MAX_LENGTH} characters — anything longer belongs on the term it applies to`
      })
    }
    if (notes === language.notes) return { notes }

    const updated = await writeLanguageNotes(language.id, notes, {
      name: auth.display_name || auth.email,
      source: 'admin'
    })
    clearGlossaryCache(language.code)
    logUpdate('glossary_languages', language.id, auth.userId, { notes_length: notes.length })
    return { notes: updated?.notes ?? '' }
  } catch (error) {
    handleApiError(error, 'Failed to save the notes', 400)
  }
})
