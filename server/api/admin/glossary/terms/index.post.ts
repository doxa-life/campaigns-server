import { createTerm, type GlossaryField } from '#server/database/glossary'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * POST /api/admin/glossary/terms — add an English term.
 * Body: { section_id, term, fields?: [{ label, value }], seed? }
 *
 * The term starts with no wording in any language; each one is drafted by the
 * next AI populate for that language, or written by a reviewer.
 */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'glossary.manage')
  const body = await readBody<{ section_id?: string; term?: string; fields?: GlossaryField[]; seed?: boolean }>(event)

  const term = (body?.term || '').trim()
  if (!term || term.length > 200) {
    throw createError({ statusCode: 400, statusMessage: 'Term is required and must be at most 200 characters' })
  }
  if (!body?.section_id) {
    throw createError({ statusCode: 400, statusMessage: 'section_id is required' })
  }
  if (body?.fields !== undefined && !Array.isArray(body.fields)) {
    throw createError({ statusCode: 400, statusMessage: 'fields must be an array of { label, value }' })
  }

  try {
    const created = await createTerm({
      section_id: body.section_id,
      term,
      fields: body.fields,
      seed: body.seed
    })
    logCreate('glossary_terms', created.id, auth.userId, { term })
    return created
  } catch (error) {
    handleApiError(error, 'Failed to create the term', 400)
  }
})
