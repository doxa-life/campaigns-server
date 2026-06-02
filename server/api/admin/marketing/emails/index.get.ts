import { marketingEmailService } from '#server/database/marketing-emails'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'marketing.view')

  const query = getQuery(event)
  const filters = {
    status: query.status as 'draft' | 'queued' | 'sending' | 'sent' | 'failed' | undefined,
    audience_type: query.audience_type as 'doxa' | 'people_group' | undefined,
    people_group_id: query.people_group_id ? Number(query.people_group_id) : undefined
  }

  const emails = await marketingEmailService.listForUser(user.userId, filters)

  return {
    emails,
    count: emails.length
  }
})
