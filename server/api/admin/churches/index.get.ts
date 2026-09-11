import { churchService } from '../../../database/churches'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'churches.view')

  const query = getQuery(event)
  const search = typeof query.search === 'string' ? query.search : undefined

  const churches = await churchService.getAll({ search })
  return { churches, total: churches.length }
})
