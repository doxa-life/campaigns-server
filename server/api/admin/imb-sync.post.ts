import { syncImbPeopleGroups } from '../../utils/app/imb-sync'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'people_groups.edit')

  const result = await syncImbPeopleGroups()
  return { upserted: result.upserted, removed: result.removed, total: result.total }
})
