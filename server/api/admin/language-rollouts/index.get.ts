import { listRollouts } from '#server/database/language-rollouts'
import { ROLLOUT_TASK_GROUPS } from '../../../../config/language-rollout-tasks'

/** GET /api/admin/language-rollouts — every language being rolled out, with its checklist. */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'glossary.view')
  return { groups: ROLLOUT_TASK_GROUPS, rollouts: await listRollouts() }
})
