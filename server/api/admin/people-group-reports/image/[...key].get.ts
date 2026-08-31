import { getSuggestionImageObject, isSuggestionImageKey } from '#server/utils/app/suggestion-images'

/**
 * Authenticated proxy for suggested people group pictures. Streams the object
 * from the PRIVATE bucket so reviewers can preview a public submission's image
 * before it is applied (and copied to the public bucket). Restricted to the
 * pg-suggestions/ prefix so it can't read arbitrary private-bucket objects.
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'people_groups.view')

  const raw = event.context.params?.key
  const key = Array.isArray(raw) ? raw.join('/') : String(raw || '')

  if (!isSuggestionImageKey(key)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid image key' })
  }

  const obj = await getSuggestionImageObject(key)
  if (!obj) {
    throw createError({ statusCode: 404, statusMessage: 'Image not found' })
  }

  setHeader(event, 'Content-Type', obj.contentType)
  setHeader(event, 'Cache-Control', 'private, max-age=3600')
  return obj.data
})
