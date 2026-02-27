import { libraryContentService } from '#server/database/library-content'
import { jobQueueService, type TranslationBatchPayload } from '#server/database/job-queue'
import { isDeepLConfigured, SUPPORTED_LANGUAGES } from '#server/utils/deepl'
import { getIntParam } from '#server/utils/api-helpers'

/**
 * Queue bulk translation for an entire library using batch jobs.
 * Creates 1 job per target language (instead of per-day).
 *
 * POST /api/admin/libraries/[libraryId]/translate
 *
 * Body:
 * - sourceLanguage: string - Language code to translate FROM
 * - overwrite: boolean - Whether to overwrite existing translations
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'content.create')

  const libraryId = getIntParam(event, 'libraryId')

  if (!isDeepLConfigured()) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Translation service not configured. Please add DEEPL_API_KEY to environment.'
    })
  }

  const body = await readBody(event)

  if (!body.sourceLanguage) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Source language is required'
    })
  }

  const { sourceLanguage, overwrite = false, targetLanguages: requestedTargetLanguages, retranslateVerses = true } = body

  // Verify there's source content
  const sourceContent = await libraryContentService.getLibraryContent(libraryId, {
    language: sourceLanguage
  })

  if (sourceContent.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: `No content found for language: ${sourceLanguage}`
    })
  }

  // Use requested target languages if provided, otherwise all except source
  const allTargetLanguages = SUPPORTED_LANGUAGES.filter(lang => lang !== sourceLanguage)
  const targetLanguages = requestedTargetLanguages
    ? (requestedTargetLanguages as string[]).filter((lang: string) => allTargetLanguages.includes(lang))
    : allTargetLanguages

  // Clean up old jobs from previous translation runs
  await jobQueueService.deleteCompletedJobs('library_translation', libraryId)

  // Create one batch job per target language
  let jobCount = 0

  for (const targetLanguage of targetLanguages) {
    const payload: TranslationBatchPayload = {
      library_id: libraryId,
      source_language: sourceLanguage,
      target_language: targetLanguage,
      overwrite,
      retranslate_verses: retranslateVerses
    }

    await jobQueueService.createJob('translation_batch', payload, {
      referenceType: 'library_translation',
      referenceId: libraryId
    })
    jobCount++
  }

  if (jobCount === 0) {
    return {
      success: true,
      message: 'No target languages configured',
      libraryId,
      totalJobs: 0
    }
  }

  return {
    success: true,
    message: `Queued ${jobCount} translation batch job(s)`,
    libraryId,
    totalJobs: jobCount
  }
})
