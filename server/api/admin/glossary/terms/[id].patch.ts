import { updateTerm, type GlossaryField } from '#server/database/glossary'
import { getUuidParam, handleApiError } from '#server/utils/api-helpers'

/**
 * PATCH /api/admin/glossary/terms/:id
 * Body: { term?, acronym?, fields?, section_id?, position?, seed? }
 *
 * Changing the headword, its acronym or its annotations invalidates every
 * review of the term, so confirmed translations of it drop back to draft and
 * are marked stale.
 */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'glossary.manage')
  const id = getUuidParam(event, 'id')
  const body = await readBody<{
    term?: string
    acronym?: string | null
    fields?: GlossaryField[]
    section_id?: string
    position?: number
    seed?: boolean
  }>(event)

  if (body?.fields !== undefined && !Array.isArray(body.fields)) {
    throw createError({ statusCode: 400, statusMessage: 'fields must be an array of { label, value }' })
  }
  const acronym = body?.acronym === undefined ? undefined : (body.acronym || '').trim() || null
  if (acronym && acronym.length > 20) {
    throw createError({ statusCode: 400, statusMessage: 'An acronym must be at most 20 characters' })
  }

  try {
    const updated = await updateTerm(id, {
      term: body?.term?.trim(),
      acronym,
      fields: body?.fields,
      section_id: body?.section_id,
      position: body?.position,
      seed: body?.seed
    })
    if (!updated) throw createError({ statusCode: 404, statusMessage: 'Term not found' })
    logUpdate('glossary_terms', id, auth.userId, { term: updated.term })
    return updated
  } catch (error) {
    handleApiError(error, 'Failed to update the term', 400)
  }
})
