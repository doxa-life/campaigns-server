import { defineEventHandler } from 'h3'
import { openrouterKeyStatus } from '#server/utils/openrouter'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * Check the OpenRouter API key the server is running with.
 *
 * Always answers 200 with an OpenRouterKeyStatus — `missing`, `invalid`,
 * `unreachable`, or `valid` with the key's label and credit balance — so the
 * UI renders every state the same way. The key itself is never returned.
 */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  try {
    return await openrouterKeyStatus()
  } catch (error) {
    handleApiError(error, 'Failed to check the OpenRouter API key')
  }
})
