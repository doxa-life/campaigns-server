import { getRollout, saveStatusReport } from '#server/database/language-rollouts'

/**
 * PUT /api/admin/language-rollouts/:code/status-report — store the latest
 * language-status survey (`language_status.py --json`) for the rollout.
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'glossary.manage')
  const code = getRouterParam(event, 'code') ?? ''

  const body = await readBody<{ report?: { surfaces?: unknown } }>(event)
  if (!body?.report || !Array.isArray(body.report.surfaces)) {
    throw createError({ statusCode: 400, statusMessage: 'report.surfaces must be an array' })
  }
  if (!(await getRollout(code))) {
    throw createError({ statusCode: 404, statusMessage: 'Rollout not found' })
  }

  await saveStatusReport(code, body.report)
  return { rollout: await getRollout(code) }
})
