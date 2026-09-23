import { getLanguageByCode } from '#server/database/glossary'
import { startRollout, getRollout } from '#server/database/language-rollouts'

/**
 * POST /api/admin/language-rollouts — start tracking a language's rollout.
 * The language must already be in the glossary. Starting one that exists is a no-op.
 */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'glossary.manage')
  const body = await readBody<{ code?: string }>(event)
  const code = typeof body?.code === 'string' ? body.code.trim() : ''
  if (!code) {
    throw createError({ statusCode: 400, statusMessage: 'code is required' })
  }
  if (!(await getLanguageByCode(code))) {
    throw createError({ statusCode: 404, statusMessage: `No glossary for language: ${code}` })
  }

  const existed = !!(await getRollout(code))
  await startRollout(code, auth.userId)
  if (!existed) {
    logCreate('language_rollouts', code, auth.userId, { code })
  }
  return { rollout: await getRollout(code) }
})
