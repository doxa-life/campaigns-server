import { getRollout, setTaskState } from '#server/database/language-rollouts'
import { getRolloutTask, ROLLOUT_TASK_STATES, type RolloutTaskState } from '../../../../../../config/language-rollout-tasks'

/**
 * PUT /api/admin/language-rollouts/:code/tasks/:key — set a skill or manual task's state.
 * Detected tasks are computed by the server and cannot be set.
 */
export default defineEventHandler(async (event) => {
  const auth = await requirePermission(event, 'glossary.manage')
  const code = getRouterParam(event, 'code') ?? ''
  const key = getRouterParam(event, 'key') ?? ''

  const task = getRolloutTask(key)
  if (!task) {
    throw createError({ statusCode: 404, statusMessage: `Unknown task: ${key}` })
  }
  if (task.kind === 'detected') {
    throw createError({ statusCode: 400, statusMessage: `${key} is detected by the server and cannot be set` })
  }

  const body = await readBody<{ state?: string; note?: string }>(event)
  if (!body?.state || !ROLLOUT_TASK_STATES.includes(body.state as RolloutTaskState)) {
    throw createError({ statusCode: 400, statusMessage: `state must be one of: ${ROLLOUT_TASK_STATES.join(', ')}` })
  }
  if (body.note !== undefined && typeof body.note !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'note must be a string' })
  }

  if (!(await getRollout(code))) {
    throw createError({ statusCode: 404, statusMessage: 'Rollout not found' })
  }

  await setTaskState(code, key, body.state as RolloutTaskState, (body.note ?? '').trim(), auth.userId)
  return { rollout: await getRollout(code) }
})
