import { getInlineImageObject, isInlineImageKey } from '#server/utils/app/inbox-inline-images'

/**
 * Authenticated proxy for composer inline images. Streams an object from the
 * PRIVATE bucket so inline images render in the in-app thread/composer without
 * exposing a public URL. Requests are same-origin <img> loads carrying the
 * auth-token cookie, so requirePermission applies. Restricted to the inline/
 * prefix so it can't be used to read arbitrary private-bucket objects.
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'inbox.view')

  const raw = event.context.params?.key
  const key = Array.isArray(raw) ? raw.join('/') : String(raw || '')

  if (!isInlineImageKey(key)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid image key' })
  }

  const obj = await getInlineImageObject(key)
  if (!obj) {
    throw createError({ statusCode: 404, statusMessage: 'Image not found' })
  }

  setHeader(event, 'Content-Type', obj.contentType)
  setHeader(event, 'Cache-Control', 'private, max-age=3600')
  return obj.data
})
