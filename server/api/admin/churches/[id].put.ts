import { churchService } from '../../../database/churches'
import { normalizeChurchInput, locationAfterUpdate, type ChurchInput } from '../../../utils/app/church-input'
import { kickChurchGeocoding } from '../../../utils/app/church-geocoder'
import { getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'churches.edit')

  const id = getIntParam(event, 'id')
  const oldRecord = await churchService.getById(id)
  if (!oldRecord) {
    throw createError({ statusCode: 404, statusMessage: 'Church not found' })
  }

  const body = await readBody<ChurchInput>(event)
  const { data, errors } = normalizeChurchInput(body)
  if (errors.length > 0) {
    throw createError({ statusCode: 400, statusMessage: errors[0] })
  }

  const applied = { ...data, ...locationAfterUpdate(oldRecord, data) }
  const updated = await churchService.update(id, applied)
  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'Church not found' })
  }

  const changes: Record<string, { from: any; to: any }> = {}
  for (const key of Object.keys(applied) as (keyof typeof applied)[]) {
    if (updated[key] !== oldRecord[key]) {
      changes[key] = { from: oldRecord[key], to: updated[key] }
    }
  }
  if (Object.keys(changes).length > 0) {
    logUpdate('churches', String(id), event, { changes })
  }

  if (updated.location_status === 'pending' && oldRecord.location_status !== 'pending') kickChurchGeocoding()

  return { church: updated }
})
