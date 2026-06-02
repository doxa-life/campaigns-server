import { listMarketingTemplates } from '#server/utils/marketing-templates'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'people_groups.view')

  return {
    templates: await listMarketingTemplates('en')
  }
})
