import { marketingSenderService } from '#server/database/marketing-senders'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'people_groups.view')

  const config = useRuntimeConfig()
  const includeInactive = getQuery(event).includeInactive === 'true'
  const senders = await marketingSenderService.list(includeInactive)

  return {
    senders,
    domain: config.marketingMailgunDomain || ''
  }
})
