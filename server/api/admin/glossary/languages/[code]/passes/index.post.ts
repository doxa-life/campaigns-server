import { getLanguageByCode, createPass } from '#server/database/glossary'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * POST /api/admin/glossary/languages/:code/passes — mint a review link.
 * Body: { label }
 *
 * The label names the round ("French pass 1"), not the person: the reviewer
 * enters their own name when they open the link.
 */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'glossary.manage')
  const code = getRouterParam(event, 'code') || ''
  const body = await readBody<{ label?: string }>(event)

  const label = (body?.label || '').trim()
  if (!label || label.length > 120) {
    throw createError({ statusCode: 400, statusMessage: 'Label is required and must be at most 120 characters' })
  }

  try {
    const language = await getLanguageByCode(code)
    if (!language) throw createError({ statusCode: 404, statusMessage: 'Language not found' })

    const pass = await createPass(language.id, label)
    logCreate('glossary_review_passes', pass.id, auth.userId, { code, label })
    return pass
  } catch (error) {
    handleApiError(error, 'Failed to create the review pass', 400)
  }
})
