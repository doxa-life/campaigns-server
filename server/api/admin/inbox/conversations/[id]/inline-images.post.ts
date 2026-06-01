import { uploadInlineImage } from '#server/utils/app/inbox-inline-images'
import { getIntParam, handleApiError } from '#server/utils/api-helpers'

/**
 * Upload an inline image for the composer (multipart: image).
 * Stored in the PRIVATE bucket; returned as an authenticated proxy URL.
 * The image is CID-embedded into the email at send time, so it never
 * leaves the system on a public URL.
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'inbox.send')

  const conversationId = getIntParam(event, 'id')

  const parts = await readMultipartFormData(event)
  const file = parts?.find(p => p.name === 'image' && p.filename)
  if (!file || !file.data || file.data.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No image file found' })
  }

  try {
    const { key } = await uploadInlineImage(conversationId, file.data)
    return { url: `/api/admin/inbox/inline-image/${key}` }
  } catch (error) {
    handleApiError(error, 'Failed to upload image')
  }
})
