import { deleteRollout } from '#server/database/language-rollouts'

/** DELETE /api/admin/language-rollouts/:code — stop tracking a rollout and drop its task states. */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'glossary.manage')
  const code = getRouterParam(event, 'code') ?? ''
  if (!(await deleteRollout(code))) {
    throw createError({ statusCode: 404, statusMessage: 'Rollout not found' })
  }
  logDelete('language_rollouts', code, auth.userId, { code })
  return { success: true }
})
