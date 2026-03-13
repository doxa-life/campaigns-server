import { notificationRecipientService } from '../database/notification-recipients'
import { LANGUAGES } from '../../config/languages'

interface AdoptionNotificationData {
  peopleGroupName: string
  peopleGroupId: number
  churchOrGroupName: string
  groupId: number
  contactName: string
  contactEmail: string
  subscriberId: number
  phone?: string
  role?: string
  language?: string
  country?: string
  permissionToContact?: boolean
  confirmPublicDisplay?: boolean
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function sendAdoptionNotificationEmail(to: string, data: AdoptionNotificationData): Promise<boolean> {
  const config = useRuntimeConfig()
  const siteUrl = config.public.siteUrl || 'http://localhost:3000'
  const appName = config.appName || 'DOXA Prayer'

  const pgName = escapeHtml(data.peopleGroupName)
  const pgUrl = `${siteUrl}/admin/people-groups/${data.peopleGroupId}`
  const groupUrl = `${siteUrl}/admin/groups/${data.groupId}`
  const subscriberUrl = `${siteUrl}/admin/subscribers/${data.subscriberId}`

  const subject = `New Adoption: ${data.peopleGroupName}`

  let rowIndex = 0
  const row = (label: string, value: string) => {
    const bg = rowIndex++ % 2 === 1 ? ' style="background: #f9f9f9;"' : ''
    return `<tr${bg}>
          <td style="padding: 8px 12px; font-weight: bold; color: #666; width: 140px;">${label}</td>
          <td style="padding: 8px 12px;">${value}</td>
        </tr>`
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${escapeHtml(subject)}</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #3B463D; margin-bottom: 20px;">New Adoption Submitted</h2>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        ${row('People Group', `<a href="${pgUrl}" style="color: #3B463D;">${pgName}</a>`)}
        ${row('Church / Group', `<a href="${groupUrl}" style="color: #3B463D;">${escapeHtml(data.churchOrGroupName)}</a>`)}
        ${row('Contact Name', `<a href="${subscriberUrl}" style="color: #3B463D;">${escapeHtml(data.contactName)}</a>`)}
        ${row('Contact Email', `<a href="mailto:${escapeHtml(data.contactEmail)}" style="color: #3B463D;">${escapeHtml(data.contactEmail)}</a>`)}
        ${data.phone ? row('Phone', escapeHtml(data.phone)) : ''}
        ${data.role ? row('Role', escapeHtml(data.role)) : ''}
        ${data.language ? row('Language', escapeHtml(LANGUAGES.find(l => l.code === data.language)?.name || data.language)) : ''}
        ${data.country ? row('Country', escapeHtml(data.country)) : ''}
        ${row('Permission to Contact', data.permissionToContact ? 'Yes' : 'No')}
        ${row('Display Publicly', data.confirmPublicDisplay ? 'Yes' : 'No')}
      </table>

      <div style="text-align: center; margin-top: 20px; padding: 15px; color: #999; font-size: 12px;">
        This is an automated notification from ${escapeHtml(appName)}.
      </div>
    </body>
    </html>
  `

  const text = [
    `New Adoption: ${data.peopleGroupName}`,
    '',
    `People Group: ${data.peopleGroupName} — ${pgUrl}`,
    `Church / Group: ${data.churchOrGroupName} — ${groupUrl}`,
    `Contact Name: ${data.contactName} — ${subscriberUrl}`,
    `Contact Email: ${data.contactEmail}`,
    data.phone ? `Phone: ${data.phone}` : '',
    data.role ? `Role: ${data.role}` : '',
    data.language ? `Language: ${LANGUAGES.find(l => l.code === data.language)?.name || data.language}` : '',
    data.country ? `Country: ${data.country}` : '',
    `Permission to Contact: ${data.permissionToContact ? 'Yes' : 'No'}`,
    `Display Publicly: ${data.confirmPublicDisplay ? 'Yes' : 'No'}`,
  ].filter(Boolean).join('\n')

  return sendEmail({ to, subject, html, text })
}

export async function notifyAdoptionRecipients(data: AdoptionNotificationData) {
  const recipients = await notificationRecipientService.getByGroup('adoption')
  if (recipients.length === 0) return

  for (const r of recipients) {
    sendAdoptionNotificationEmail(r.email, data)
      .catch(err => console.error('Failed to send adoption notification:', err))
  }
}
