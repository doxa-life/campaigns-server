import { marketingEmailService } from '#server/database/marketing-emails'
import { renderMarketingEmailHtml, renderMarketingEmailFromHtml, tiptapToText } from '#server/utils/marketing-email-template'
import { getMarketingTemplate } from '#server/utils/marketing-templates'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'marketing.view')

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

  const template = getMarketingTemplate(email.template)

  if (template) {
    const surveyUrl = `${baseUrl}/survey?id=preview`
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

  // Placeholder personal link so a resubscribe-button node shows up in the preview;
  // real sends substitute each recipient's own profile URL.
  const renderOptions = { resubscribeUrl: `${baseUrl}/subscriber?id=preview&resume=1` }

  const html = renderMarketingEmailHtml(
    email.content_json,
    email.audience_type === 'people_group' ? email.people_group_name : undefined,
    unsubscribeUrl,
    'en',
    renderOptions
  )

  const text = tiptapToText(email.content_json, renderOptions)

  return {
    subject: email.subject,
    html,
    text
  }
})
