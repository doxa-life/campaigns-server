import { churchService } from '../../../database/churches'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'churches.view')
  return { languages: await churchService.distinctServiceLanguages() }
})
