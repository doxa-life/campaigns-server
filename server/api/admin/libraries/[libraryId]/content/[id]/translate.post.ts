import { libraryContentService } from '#server/database/library-content'
import { libraryService } from '#server/database/libraries'
import { requireContentAccess } from '#server/utils/content-access'
import { translateTiptapContent, reconcileVersesFromSource, isTranslationConfigured, type TiptapNode, type VerseWarning } from '#server/utils/translate'
import { getErrorMessage, getIntParam } from '#server/utils/api-helpers'

/**
 * Translate library content to one or more target languages
 *
 * POST /api/admin/libraries/[libraryId]/content/[id]/translate
 *
 * Body:
 * - sourceLanguage: string - Language code to translate FROM
 * - targetLanguages: string[] - Language codes to translate TO
 * - overwrite: boolean - Whether to overwrite existing translations
 *
 * Returns array of created/updated content records
 */
export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'content.create')

  const libraryId = getIntParam(event, 'libraryId')
  const contentId = getIntParam(event, 'id')

  const body = await readBody(event)

  // Validate required fields
  if (!body.source_language) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Source language is required'
    })
  }

  if (!body.target_languages || !Array.isArray(body.target_languages) || body.target_languages.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'At least one target language is required'
    })
  }

  const { source_language: sourceLanguage, target_languages: targetLanguages, overwrite = false, retranslate_verses: retranslateVerses = true } = body

  // Get the source content
  const sourceContent = await libraryContentService.getLibraryContentById(contentId)

  if (!sourceContent) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Source content not found'
    })
  }

  // Verify it belongs to the library
  if (sourceContent.library_id !== libraryId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Content does not belong to this library'
    })
  }

  // Verify source language matches
  if (sourceContent.language_code !== sourceLanguage) {
    throw createError({
      statusCode: 400,
      statusMessage: `Source content is in ${sourceContent.language_code}, not ${sourceLanguage}`
    })
  }

  // Verify content exists
  if (!sourceContent.content_json) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Source content is empty'
    })
  }

  // Translating writes every target language, so each one must be within the user's scope.
  const library = await libraryService.getLibraryById(libraryId)
  await requireContentAccess(user.userId, 'content.create', {
    peopleGroupId: library?.people_group_id,
    languageCodes: targetLanguages
  })

  // Existing target content with overwrite off is skipped or verse-refreshed without the
  // translator, so the service only has to be configured for targets that get translated.
  const existingByLanguage = new Map<string, Awaited<ReturnType<typeof libraryContentService.getLibraryContentByDay>>>()
  for (const targetLanguage of targetLanguages) {
    if (targetLanguage === sourceLanguage) continue
    existingByLanguage.set(targetLanguage, await libraryContentService.getLibraryContentByDay(libraryId, sourceContent.day_number, targetLanguage))
  }
  const needsTranslator = [...existingByLanguage.values()].some(existing => !existing || overwrite)
  if (needsTranslator && !isTranslationConfigured()) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Translation service not configured. Please add OPENROUTER_API_KEY to environment.'
    })
  }

  const results: Array<{
    language: string
    success: boolean
    content?: any
    error?: string
    skipped?: boolean
  }> = []

  // Process each target language
  for (const targetLanguage of targetLanguages) {
    // Skip if target is same as source
    if (targetLanguage === sourceLanguage) {
      results.push({
        language: targetLanguage,
        success: false,
        error: 'Cannot translate to source language',
        skipped: true
      })
      continue
    }

    try {
      const existingContent = existingByLanguage.get(targetLanguage) ?? null

      if (existingContent && !overwrite) {
        if (retranslateVerses && existingContent.content_json) {
          // Verse-only update: re-fetch verses from the English source and keep
          // the translation structurally in sync (verses added/removed in the
          // source propagate), preserving the translated prose.
          const verseWarnings: VerseWarning[] = []
          const targetDoc = await reconcileVersesFromSource(
            sourceContent.content_json as TiptapNode,
            existingContent.content_json as TiptapNode,
            targetLanguage,
            verseWarnings
          )

          const updated = await libraryContentService.updateLibraryContent(existingContent.id, {
            content_json: targetDoc
          })

          if (verseWarnings.length > 0) {
            console.warn(`[Translate] ${verseWarnings.length} verse warning(s) for ${targetLanguage}:`, verseWarnings)
          }

          results.push({
            language: targetLanguage,
            success: true,
            content: updated
          })
        } else {
          results.push({
            language: targetLanguage,
            success: true,
            skipped: true,
            content: existingContent
          })
        }
        continue
      }

      // Translate the content (cast to expected type since we validated it exists)
      const { doc: translatedJson, verseWarnings } = await translateTiptapContent(
        sourceContent.content_json as Parameters<typeof translateTiptapContent>[0],
        targetLanguage,
        sourceLanguage
      )

      if (verseWarnings.length > 0) {
        console.warn(`[Translate] ${verseWarnings.length} verse warning(s) for ${targetLanguage}:`, verseWarnings)
      }

      let savedContent
      if (existingContent) {
        // Update existing content
        savedContent = await libraryContentService.updateLibraryContent(existingContent.id, {
          content_json: translatedJson
        })
      } else {
        // Create new content
        savedContent = await libraryContentService.createLibraryContent({
          library_id: libraryId,
          day_number: sourceContent.day_number,
          language_code: targetLanguage,
          content_json: translatedJson
        })
      }

      results.push({
        language: targetLanguage,
        success: true,
        content: savedContent
      })
    } catch (error) {
      results.push({
        language: targetLanguage,
        success: false,
        error: getErrorMessage(error)
      })
    }
  }

  const successCount = results.filter(r => r.success && !r.skipped).length
  const skippedCount = results.filter(r => r.skipped).length
  const failedCount = results.filter(r => !r.success).length

  return {
    success: failedCount === 0,
    message: `Translated ${successCount} language(s), skipped ${skippedCount}, failed ${failedCount}`,
    results
  }
})
