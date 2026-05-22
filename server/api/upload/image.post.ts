import { uploadPublicImage } from '#server/utils/app/public-image-storage'

export default defineEventHandler(async (event) => {
  // Require authentication
  requireAuth(event)

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

    // Return URL in Editor.js format (consumed by the Tiptap image upload
    // extension and the inbox composer's image button).
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
