import { adoptionReportService } from '../../../../../../database/adoption-reports'
import { peopleGroupAdoptionService } from '../../../../../../database/people-group-adoptions'
import { getIntParam } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'groups.view')

  const groupId = getIntParam(event, 'id')
  const adoptionId = getIntParam(event, 'adoptionId')

  const adoption = await peopleGroupAdoptionService.getById(adoptionId)
  if (!adoption || adoption.group_id !== groupId) {
    throw createError({ statusCode: 404, statusMessage: 'Adoption not found' })
  }

  const reports = await adoptionReportService.getForAdoption(adoptionId)

  return { reports }
})
