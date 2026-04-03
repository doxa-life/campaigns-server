import { getSql } from '#server/database/db'
import { jobQueueService, type TranslationBatchPayload } from '#server/database/job-queue'
import { isDeepLConfigured, SUPPORTED_LANGUAGES } from '#server/utils/deepl'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * Bulk translate ALL day_in_life libraries to all target languages.
 *
 * POST /api/admin/superadmin/translate-dinl
 *
 * Body:
 * - overwrite?: boolean - Whether to overwrite existing translations
 *
 * Creates translation_batch jobs (1 per library per target language)
 * with reference_type='bulk_dinl' for tracking.
 */
export default defineEventHandler(async (event) => {
  try {
    await requireSuperAdmin(event)

    if (!isDeepLConfigured()) {
      throw createError({
        statusCode: 503,
        statusMessage: 'Translation service not configured. Please add DEEPL_API_KEY to environment.'
      })
    }

    const body = await readBody(event)
    const overwrite = body?.overwrite ?? false

    const sql = getSql()

    // Find all day_in_life libraries that have English content
    const libraries = await sql`
      SELECT DISTINCT l.id, l.name, l.people_group_id
      FROM libraries l
      INNER JOIN library_content lc ON lc.library_id = l.id AND lc.language_code = 'en'
      WHERE l.library_key = 'day_in_life'
      ORDER BY l.id
    ` as Array<{ id: number; name: string; people_group_id: number | null }>

    if (libraries.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No day_in_life libraries with English content found'
      })
    }

    // Target languages = all languages except English
    const targetLanguages = SUPPORTED_LANGUAGES.filter(lang => lang !== 'en')

    if (targetLanguages.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No target languages configured'
      })
    }

    // Generate a batch ID for tracking all jobs together (must fit in pg INTEGER)
    const batchId = Math.floor(Date.now() / 1000)

    let totalJobs = 0

    for (const library of libraries) {
      for (const targetLanguage of targetLanguages) {
        const payload: TranslationBatchPayload = {
          library_id: library.id,
          source_language: 'en',
          target_language: targetLanguage,
          overwrite,
          retranslate_verses: false
        }

        await jobQueueService.createJob('translation_batch', payload, {
          referenceType: 'bulk_dinl',
          referenceId: batchId
        })
        totalJobs++
      }
    }

    return {
      success: true,
      batchId,
      totalLibraries: libraries.length,
      targetLanguages,
      totalJobs
    }
  } catch (error) {
    handleApiError(error, 'Failed to start bulk translation')
  }
})
