import { churchService } from '../../../../database/churches'
import { kickChurchGeocoding } from '../../../../utils/app/church-geocoder'
import { getIntParam } from '#server/utils/api-helpers'

/** Queues a fresh lookup from the church's town and country, discarding any placed pin. */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'churches.edit')

  const id = getIntParam(event, 'id')
  const church = await churchService.getById(id)
  if (!church) {
    throw createError({ statusCode: 404, statusMessage: 'Church not found' })
  }
  if (!church.town || !church.country) {
    throw createError({ statusCode: 400, statusMessage: 'A town and country are needed to look up the location' })
  }

  const updated = await churchService.update(id, { latitude: null, longitude: null, location_status: 'pending' })
  logUpdate('churches', String(id), event, { changes: { location_status: { from: church.location_status, to: 'pending' } } })
  kickChurchGeocoding()

  return { church: updated }
})
