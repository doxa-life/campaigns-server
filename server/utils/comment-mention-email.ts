import { getDatabase } from '#server/database/db'

/**
 * Send notification emails to users mentioned in a comment.
 */
export async function sendCommentMentionEmails(
  mentionedUserIds: string[],
  authorName: string,
  recordType: string,
  recordId: number,
  recordName: string
): Promise<void> {
  if (mentionedUserIds.length === 0) return

  const config = useRuntimeConfig()
  const baseUrl = config.public.siteUrl || 'http://localhost:3000'
  const appName = config.appName || 'Doxa'

  const recordTypeLabel = recordType.replace(/_/g, ' ')
  const recordUrl = `${baseUrl}/admin/${recordType.replace(/_/g, '-')}s/${recordId}`

  // Look up email addresses for mentioned users
  const db = getDatabase()
  const placeholders = mentionedUserIds.map(() => '?').join(',')
  const stmt = db.prepare(`SELECT id, email, display_name FROM users WHERE id IN (${placeholders})`)
  const users = await stmt.all(...mentionedUserIds) as Array<{ id: string; email: string; display_name: string }>

  for (const user of users) {
    if (!user.email) continue

    const subject = `${authorName} mentioned you in a comment on ${appName}`

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #3B463D; background: #ffffff; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #3B463D; color: #ffffff; padding: 20px 30px; border-radius: 10px 10px 0 0;">
          <h2 style="margin: 0; font-size: 20px; font-weight: 500;">New Mention</h2>
        </div>
        <div style="background: #ffffff; border: 2px solid #3B463D; border-top: none; padding: 30px; border-radius: 0 0 10px 10px;">
          <p style="font-size: 16px; margin: 0 0 20px;">
            <strong>${authorName}</strong> mentioned you in a comment on ${recordTypeLabel} "<strong>${recordName}</strong>".
          </p>
          <div style="text-align: center; margin: 20px 0;">
            <a href="${recordUrl}" style="
              background: #3B463D;
              color: #ffffff;
              padding: 12px 24px;
              text-decoration: none;
              border-radius: 5px;
              font-weight: 500;
              font-size: 14px;
              display: inline-block;
            ">View Comment</a>
          </div>
        </div>
        <div style="text-align: center; margin-top: 20px; padding: 20px; color: #666666; font-size: 12px;">
          <p style="margin: 0;">This is an automated message from ${appName}.</p>
        </div>
      </body>
      </html>
    `

    const text = `${authorName} mentioned you in a comment on ${recordTypeLabel} "${recordName}".

View it here: ${recordUrl}

This is an automated message from ${appName}.`

    try {
      await sendEmail({ to: user.email, subject, html, text })
    } catch (err) {
      console.error(`Failed to send mention email to ${user.email}:`, err)
    }
  }
}
