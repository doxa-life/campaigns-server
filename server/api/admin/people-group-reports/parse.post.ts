import { isAnthropicConfigured } from '#server/utils/anthropic'
import { parseReportText } from '#server/utils/app/report-parser'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'people_groups.edit')

  if (!isAnthropicConfigured()) {
    throw createError({ statusCode: 503, statusMessage: 'AI parsing is not configured. ANTHROPIC_API_KEY is missing.' })
  }

  const body = await readBody<{ text: string }>(event)

  if (!body.text?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Report text is required' })
  }

  if (body.text.length > 10000) {
    throw createError({ statusCode: 400, statusMessage: 'Report text is too long (max 10,000 characters)' })
  }

  try {
    const parsed = await parseReportText(body.text)
    return { parsed }
  } catch (error: any) {
    throw createError({ statusCode: 500, statusMessage: error.message || 'Failed to parse report' })
  }
})
