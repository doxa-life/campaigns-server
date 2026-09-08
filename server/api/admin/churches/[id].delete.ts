import { churchService } from '../../../database/churches'
import { getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'churches.delete')

  const id = getIntParam(event, 'id')
  const church = await churchService.getById(id)
  if (!church) {
    throw createError({ statusCode: 404, statusMessage: 'Church not found' })
  }

  await doAction('record.delete', 'church', id)
  await churchService.delete(id)
  logDelete('churches', String(id), event, { name: church.name })

  return { success: true }
})
