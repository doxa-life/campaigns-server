import { inboxTagService, TAG_COLORS, type TagColor } from '#server/database/inbox-tags'
import { handleApiError } from '#server/utils/api-helpers'

// Create a tag in the palette (inline create-on-assign). Idempotent by slug: posting
// an existing name returns the existing tag rather than duplicating it.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'inbox.view')

  const body = await readBody<{ name?: string; color?: string }>(event)
  const name = (body.name || '').trim()
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'Tag name is required' })
  }
  const color = (TAG_COLORS as readonly string[]).includes(body.color || '')
    ? (body.color as TagColor)
    : undefined

  try {
    const tag = await inboxTagService.create(name, color)
    return { tag }
  } catch (error) {
    handleApiError(error, 'Failed to create tag')
  }
})
