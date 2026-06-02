import { marketingEmailService } from '#server/database/marketing-emails'
import { renderMarketingEmailHtml, renderMarketingEmailFromHtml, tiptapToText } from '#server/utils/marketing-email-template'
import { getMarketingTemplate } from '#server/utils/marketing-templates'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'people_groups.view')

  const id = Number(getRouterParam(event, 'id'))
  if (!id || isNaN(id)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid email ID'
    })
  }

  const canAccess = await marketingEmailService.canUserAccessEmail(user.userId, id)
  if (!canAccess) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Email not found'
    })
  }

  const email = await marketingEmailService.getByIdWithPeopleGroup(id)
  if (!email) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Email not found'
    })
  }

  const config = useRuntimeConfig()
  const baseUrl = config.public.siteUrl || 'https://example.com'
  const unsubscribeUrl = `${baseUrl}/unsubscribe?id=preview`

  const template = await getMarketingTemplate(email.template)

  if (template) {
    const surveyUrl = `${baseUrl}/survey/${email.template}?id=preview`
    const vars = { surveyUrl, name: 'Friend' }
    const html = renderMarketingEmailFromHtml(
      template.renderContentHtml('en', vars),
      undefined,
      unsubscribeUrl,
      'en',
      template.getHeader('en')
    )
    return {
      subject: template.getSubject('en'),
      html,
      text: template.renderText('en', vars)
    }
  }

  const html = renderMarketingEmailHtml(
    email.content_json,
    email.audience_type === 'people_group' ? email.people_group_name : undefined,
    unsubscribeUrl
  )

  const text = tiptapToText(email.content_json)

  return {
    subject: email.subject,
    html,
    text
  }
})
