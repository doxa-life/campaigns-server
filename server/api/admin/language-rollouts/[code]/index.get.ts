import { getRollout } from '#server/database/language-rollouts'

/** GET /api/admin/language-rollouts/:code — one language's rollout checklist. */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'glossary.view')
  const rollout = await getRollout(getRouterParam(event, 'code') ?? '')
  if (!rollout) {
    throw createError({ statusCode: 404, statusMessage: 'Rollout not found' })
  }
  return { rollout }
})
