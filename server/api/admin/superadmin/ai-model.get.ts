import { defineEventHandler } from 'h3'
import { getAiModel } from '#server/utils/anthropic'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * Get the Claude model used for all AI calls (report parsing + inbox).
 *
 * Returns the effective model — the stored app_config value if set, otherwise
 * the env/default fallback — so the UI always shows what AI calls actually use.
 */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  try {
    return { ai_model: await getAiModel() }
  } catch (error) {
    handleApiError(error, 'Failed to fetch AI model configuration')
  }
})
