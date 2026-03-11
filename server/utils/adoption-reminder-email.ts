export interface AdoptionReminderEmailData {
  to: string
  contactName: string
  groupName: string
  adoptions: {
    peopleGroupName: string
    updateUrl: string
  }[]
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function sendAdoptionReminderEmail(data: AdoptionReminderEmailData): Promise<boolean> {
  const config = useRuntimeConfig()
  const appName = config.appName || 'DOXA Prayer'

  const subject = `${appName} - Monthly Adoption Update for ${data.groupName}`

  const adoptionRows = data.adoptions.map(a => `
    <tr>
      <td style="padding: 12px 16px; border-bottom: 1px solid #e5e5e5; font-size: 15px;">
        ${escapeHtml(a.peopleGroupName)}
      </td>
      <td style="padding: 12px 16px; border-bottom: 1px solid #e5e5e5; text-align: right;">
        <a href="${escapeHtml(a.updateUrl)}" style="display: inline-block; padding: 8px 20px; background: #3B463D; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500;">
          Submit Update
        </a>
      </td>
    </tr>
  `).join('')

  const adoptionTextList = data.adoptions.map(a =>
    `- ${a.peopleGroupName}: ${a.updateUrl}`
  ).join('\n')

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Monthly Adoption Update</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #3B463D; background: #ffffff; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #3B463D; color: #ffffff; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="margin: 0; font-size: 24px; font-weight: 500;">Monthly Adoption Update</h1>
        <p style="margin: 10px 0 0; font-size: 16px; opacity: 0.8;">${escapeHtml(data.groupName)}</p>
      </div>

      <div style="background: #ffffff; border: 2px solid #3B463D; border-top: none; padding: 40px 30px; border-radius: 0 0 10px 10px;">
        <h2 style="color: #3B463D; margin-top: 0; font-weight: 500;">Hello ${escapeHtml(data.contactName)},</h2>

        <p style="font-size: 16px; margin: 20px 0; color: #3B463D;">
          It's time for your monthly adoption update! We'd love to hear how things are going with your adopted people groups. Please take a moment to share any updates.
        </p>

        <table style="width: 100%; border-collapse: collapse; margin: 30px 0;">
          <thead>
            <tr>
              <th style="padding: 12px 16px; text-align: left; border-bottom: 2px solid #3B463D; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em;">People Group</th>
              <th style="padding: 12px 16px; text-align: right; border-bottom: 2px solid #3B463D; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${adoptionRows}
          </tbody>
        </table>

        <p style="font-size: 14px; color: #666666; margin-top: 30px; text-align: center;">
          Your updates help us track the impact of prayer and keep our community informed.
        </p>
      </div>

      <div style="text-align: center; margin-top: 20px; padding: 20px; color: #666666; font-size: 12px;">
        <p style="margin: 0;">This email was sent by ${appName}</p>
      </div>
    </body>
    </html>
  `

  const text = `
Monthly Adoption Update - ${data.groupName}

Hello ${data.contactName},

It's time for your monthly adoption update! We'd love to hear how things are going with your adopted people groups.

Your adopted people groups:
${adoptionTextList}

Your updates help us track the impact of prayer and keep our community informed.

---
This email was sent by ${appName}
  `.trim()

  return await sendEmail({
    to: data.to,
    subject,
    html,
    text
  })
}
