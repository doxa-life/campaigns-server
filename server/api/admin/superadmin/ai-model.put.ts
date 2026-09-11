import { defineEventHandler, createError, readBody } from 'h3'
import { appConfigService } from '#server/database/app-config'
import { AI_MODEL_CONFIG_KEY, getAiModel } from '#server/utils/ai'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * Set the model used for all AI calls.
 *
 * Body: { ai_model: "anthropic/claude-sonnet-4.6" }
 *
 * Free-text on purpose: the value is passed straight to OpenRouter, so a newly
 * released model can be adopted by typing its id — no code change. Only the
 * `provider/model` shape is checked here; an id that no provider serves surfaces
 * as an API error on the next AI call.
 */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  try {
    const body = await readBody(event)
    const value = typeof body.ai_model === 'string' ? body.ai_model.trim() : ''

    if (!value) {
      throw createError({ statusCode: 400, statusMessage: 'ai_model is required' })
    }

    if (!value.includes('/')) {
      throw createError({ statusCode: 400, statusMessage: 'ai_model must be an OpenRouter id in the form provider/model' })
    }

    await appConfigService.setConfig(AI_MODEL_CONFIG_KEY, value)

    return { ai_model: await getAiModel() }
  } catch (error) {
    handleApiError(error, 'Failed to update AI model configuration')
  }
})
