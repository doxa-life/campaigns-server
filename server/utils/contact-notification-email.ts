import { notificationRecipientService } from '../database/notification-recipients'

interface ContactNotificationData {
  name: string
  email: string
  message: string
  subscriberId: number
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function sendContactNotificationEmail(to: string, data: ContactNotificationData): Promise<boolean> {
  const config = useRuntimeConfig()
  const siteUrl = config.public.siteUrl || 'http://localhost:3000'
  const appName = config.appName || 'DOXA Prayer'

  const subscriberUrl = `${siteUrl}/admin/subscribers/${data.subscriberId}`
  const subject = 'New Contact Form Submission'

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
      <h2 style="color: #3B463D; margin-bottom: 20px;">New Contact Form Submission</h2>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        ${row('Name', `<a href="${subscriberUrl}" style="color: #3B463D;">${escapeHtml(data.name)}</a>`)}
        ${row('Email', `<a href="mailto:${escapeHtml(data.email)}" style="color: #3B463D;">${escapeHtml(data.email)}</a>`)}
        ${row('Message', escapeHtml(data.message).replace(/\n/g, '<br>'))}
      </table>

      <div style="text-align: center; margin-top: 20px; padding: 15px; color: #999; font-size: 12px;">
        This is an automated notification from ${escapeHtml(appName)}.
      </div>
    </body>
    </html>
  `

  const text = [
    'New Contact Form Submission',
    '',
    `Name: ${data.name} — ${subscriberUrl}`,
    `Email: ${data.email}`,
    `Message: ${data.message}`,
  ].join('\n')

  return sendEmail({ to, subject, html, text })
}

export async function notifyContactRecipients(data: ContactNotificationData) {
  const recipients = await notificationRecipientService.getByGroup('contact_us')
  if (recipients.length === 0) return

  const results = await Promise.allSettled(
    recipients.map(r => sendContactNotificationEmail(r.email, data))
  )
  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('Failed to send contact notification:', result.reason)
    }
  }
}
