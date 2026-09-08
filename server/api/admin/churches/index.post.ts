import { churchService } from '../../../database/churches'
import { normalizeChurchInput, initialLocationStatus, type ChurchInput } from '../../../utils/app/church-input'
import { kickChurchGeocoding } from '../../../utils/app/church-geocoder'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'churches.create')

  const body = await readBody<ChurchInput>(event)
  const { data, errors } = normalizeChurchInput({ name: null, ...body })
  if (errors.length > 0) {
    throw createError({ statusCode: 400, statusMessage: errors[0] })
  }

  const church = await churchService.create({
    ...data,
    name: data.name!,
    location_status: initialLocationStatus(data)
  })

  logCreate('churches', String(church.id), event)
  if (church.location_status === 'pending') kickChurchGeocoding()

  return { church }
})
