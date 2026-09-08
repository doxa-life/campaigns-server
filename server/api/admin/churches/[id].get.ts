import { churchService } from '../../../database/churches'
import { getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'churches.view')

  const id = getIntParam(event, 'id')
  const church = await churchService.getById(id)
  if (!church) {
    throw createError({ statusCode: 404, statusMessage: 'Church not found' })
  }

  return { church }
})
