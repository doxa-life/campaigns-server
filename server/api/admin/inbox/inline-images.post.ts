import { uploadInlineImage } from '#server/utils/app/inbox-inline-images'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * Upload an inline image while composing a brand-new email (no conversation yet).
 * Same storage as the per-conversation variant (PRIVATE bucket, auth'd proxy URL,
 * CID-embedded at send time); keyed under `inline/compose/` instead of a conversation id.
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'inbox.send')

  const parts = await readMultipartFormData(event)
  const file = parts?.find(p => p.name === 'image' && p.filename)
  if (!file || !file.data || file.data.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No image file found' })
  }

  try {
    const { key } = await uploadInlineImage('compose', file.data)
    return { url: `/api/admin/inbox/inline-image/${key}` }
  } catch (error) {
    handleApiError(error, 'Failed to upload image')
  }
})
