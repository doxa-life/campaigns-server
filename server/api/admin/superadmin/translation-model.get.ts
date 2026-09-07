import { defineEventHandler } from 'h3'
import { getTranslationModel } from '#server/utils/openrouter'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * Get the OpenRouter model used for content translation.
 *
 * Returns the effective model — the stored app_config value if set, otherwise
 * the env/default fallback — so the UI always shows what translations actually use.
 */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  try {
    return { translation_model: await getTranslationModel() }
  } catch (error) {
    handleApiError(error, 'Failed to fetch translation model configuration')
  }
})
