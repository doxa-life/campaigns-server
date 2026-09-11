import { defineEventHandler, createError, readBody } from 'h3'
import { appConfigService } from '#server/database/app-config'
import { TRANSLATION_MODEL_CONFIG_KEY, getTranslationModel } from '#server/utils/openrouter'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * Set the OpenRouter model used for content translation.
 *
 * Body: { translation_model: "google/gemini-3.1-pro-preview" }
 *
 * Free-text on purpose: the value is passed straight to the OpenRouter API, so a
 * newly released model can be adopted by typing its id — no code change. Only the
 * `provider/model` shape is checked here; an id that no provider serves surfaces
 * as an API error on the next translation.
 */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  try {
    const body = await readBody(event)
    const value = typeof body.translation_model === 'string' ? body.translation_model.trim() : ''

    if (!value) {
      throw createError({ statusCode: 400, statusMessage: 'translation_model is required' })
    }

    if (!value.includes('/')) {
      throw createError({ statusCode: 400, statusMessage: 'translation_model must be an OpenRouter id in the form provider/model' })
    }

    await appConfigService.setConfig(TRANSLATION_MODEL_CONFIG_KEY, value)

    return { translation_model: await getTranslationModel() }
  } catch (error) {
    handleApiError(error, 'Failed to update translation model configuration')
  }
})
