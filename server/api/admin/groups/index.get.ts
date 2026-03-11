import { groupService } from '../../../database/groups'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const query = getQuery(event)
  const search = query.search as string | undefined
  const limit = query.limit ? parseInt(query.limit as string) : undefined
  const offset = query.offset ? parseInt(query.offset as string) : undefined

  const [groups, total] = await Promise.all([
    groupService.getAll({ search, limit, offset }),
    groupService.count(search)
  ])

  return { groups, total }
})
