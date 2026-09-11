import { marketingSenderService } from '#server/database/marketing-senders'
import { getMarketingEmailDomain } from '#server/utils/marketing-email-sender'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'marketing.view')

  const includeInactive = getQuery(event).includeInactive === 'true'
  const senders = await marketingSenderService.list(includeInactive)

  return {
    senders,
    domain: getMarketingEmailDomain()
  }
})
