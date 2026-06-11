import { uploadPublicImage } from '#server/utils/app/public-image-storage'
import { roleService } from '#server/database/roles'

export default defineEventHandler(async (event) => {
  // Authenticated staff only, and only those who can author in one of the rich-text editors
  // that use this endpoint (library content or marketing emails) — otherwise a role-less user
  // could push images into the public bucket. (requireAuth is synchronous; awaited for convention.)
  const user = await requireAuth(event)
  const canAuthor = (await Promise.all([
    roleService.userHasPermission(user.userId, 'content.create'),
    roleService.userHasPermission(user.userId, 'content.edit'),
    roleService.userHasPermission(user.userId, 'marketing.send'),
    roleService.userHasPermission(user.userId, 'marketing.view'),
  ])).some(Boolean)
  if (!canAuthor) {
    throw createError({ statusCode: 403, statusMessage: 'Insufficient permissions' })
  }

  try {
    // Get the form data
    const formData = await readMultipartFormData(event)

    if (!formData || formData.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No file uploaded'
      })
    }

    // Get the file from form data
    const file = formData.find(item => item.name === 'image')

    if (!file || !file.data || file.data.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No image file found'
      })
    }

    // Upload to the public images bucket. The file type is validated by
    // magic-byte sniffing inside uploadPublicImage (the browser-declared
    // Content-Type is not trusted since the object is publicly served).
    const { url } = await uploadPublicImage(file.data)

    // Return URL in Editor.js format (consumed by the Tiptap ImageUploadExtension
    // in RichTextEditor — library content and marketing emails). The inbox composer
    // uses its own private-bucket endpoint and does not hit this route.
    return {
      success: 1,
      file: {
        url
      }
    }
  } catch (error: any) {
    // Re-throw HTTP errors (from createError) - don't swallow validation errors
    if (error.statusCode) {
      throw error
    }

    // For unexpected errors, throw 500
    console.error('Upload error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to upload image'
    })
  }
})
