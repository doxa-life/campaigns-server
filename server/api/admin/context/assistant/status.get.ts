import { isAiConfigured, getAiModel } from '#server/utils/ai'

/**
 * GET /api/admin/context/assistant/status — whether the assistant can run.
 * The launcher stays hidden when it cannot, rather than offering a chat that
 * fails on the first message.
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'context.view')
  const configured = isAiConfigured()
  return {
    available: configured,
    model: configured ? await getAiModel() : null
  }
})
