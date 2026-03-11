export interface AdoptionWelcomeEmailData {
  to: string
  firstName: string
  peopleGroupName: string
  peopleGroupSlug: string
  joshuaProjectId: string | null
  remainingGroupsCount: number
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function sendAdoptionWelcomeEmail(data: AdoptionWelcomeEmailData): Promise<boolean> {
  const config = useRuntimeConfig()
  const siteUrl = config.public.siteUrl || 'http://localhost:3000'
  const appName = config.appName || 'DOXA Prayer'

  const firstName = escapeHtml(data.firstName)
  const peopleGroupName = escapeHtml(data.peopleGroupName)
  const slug = encodeURIComponent(data.peopleGroupSlug)

  const profileUrl = `${siteUrl}/${slug}`
  const resourcesUrl = `https://doxa.life/research/${slug}/resources/`

  const joshuaProjectUrl = data.joshuaProjectId
    ? `https://joshuaproject.net/people_groups/${encodeURIComponent(data.joshuaProjectId)}`
    : null
  const peoplegroupsOrgUrl = data.joshuaProjectId
    ? `https://www.peoplegroups.org/explore/groupdetails.aspx?peid=${encodeURIComponent(data.joshuaProjectId)}`
    : null

  const subject = `DOXA Briefing: Your Commitment to the ${data.peopleGroupName}`

  const externalLinksHtml = (peoplegroupsOrgUrl || joshuaProjectUrl) ? `
        <p style="font-size: 14px; color: #666666; margin: 15px 0 0;">
          Learn more:
          ${peoplegroupsOrgUrl ? `<a href="${peoplegroupsOrgUrl}" style="color: #3B463D; text-decoration: underline;">Peoplegroups.org</a>` : ''}
          ${peoplegroupsOrgUrl && joshuaProjectUrl ? ' | ' : ''}
          ${joshuaProjectUrl ? `<a href="${joshuaProjectUrl}" style="color: #3B463D; text-decoration: underline;">Joshua Project</a>` : ''}
        </p>` : ''

  const externalLinksText = [
    peoplegroupsOrgUrl ? `  Peoplegroups.org: ${peoplegroupsOrgUrl}` : '',
    joshuaProjectUrl ? `  Joshua Project: ${joshuaProjectUrl}` : ''
  ].filter(Boolean).join('\n')

  const beforeCount = (data.remainingGroupsCount + 1).toLocaleString()
  const afterCount = data.remainingGroupsCount.toLocaleString()

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapeHtml(subject)}</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #3B463D; background: #ffffff; max-width: 600px; margin: 0 auto; padding: 20px;">
      <img src="${siteUrl}/images/template-header-doxa.jpeg" alt="DOXA" style="width: 100%; display: block; border-radius: 10px 10px 0 0;" />
      <div style="background: #3B463D; color: #ffffff; padding: 30px; text-align: center;">
        <h1 style="margin: 0; font-size: 28px; font-weight: 500;">DOXA Adoption Briefing</h1>
        <p style="margin: 10px 0 0; font-size: 16px; opacity: 0.8;">${peopleGroupName}</p>
      </div>

      <div style="background: #ffffff; border: 2px solid #3B463D; border-top: none; padding: 40px 30px; border-radius: 0 0 10px 10px;">
        <h2 style="color: #3B463D; margin-top: 0; font-weight: 500;">Dear ${firstName},</h2>

        <p style="font-size: 16px; margin: 20px 0; color: #3B463D;">
          Today, as part of the DOXA partnership, you changed the status of the ${peopleGroupName} from <strong>waiting</strong> to <strong>adopted</strong>, the vital first step to engagement. You are now a primary advocate, intercessor, and mobilizer for a people group who, until this moment, had no consistent witness or dedicated prayer effort.
        </p>

        <p style="font-size: 16px; margin: 20px 0; color: #3B463D;">
          The following resources will help you steward this opportunity.
        </p>

        <h3 style="color: #3B463D; font-size: 18px; margin: 30px 0 15px; font-weight: 600;">1. Who You Are Standing For</h3>
        <div style="text-align: center; margin: 20px 0;">
          <a href="${profileUrl}" style="background: #3B463D; color: #ffffff; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: 500; font-size: 16px; display: inline-block; border: 2px solid #3B463D;">People Group Full Profile</a>
        </div>
${externalLinksHtml}

        <h3 style="color: #3B463D; font-size: 18px; margin: 30px 0 15px; font-weight: 600;">2. Your Mobilization Toolkit</h3>
        <p style="font-size: 16px; margin: 0 0 10px; color: #3B463D;">
          You don't have to start from scratch. Access resources at <a href="${resourcesUrl}" style="color: #3B463D; text-decoration: underline;">${resourcesUrl}</a>:
        </p>
        <ul style="font-size: 15px; color: #3B463D; margin: 10px 0 20px; padding-left: 20px;">
          <li style="margin-bottom: 8px;">URL and QR code to your people group, tips, answers to frequently asked questions, and more</li>
          <li style="margin-bottom: 8px;">Images to help you introduce this to your church or small group</li>
          <li style="margin-bottom: 8px;">A dedicated link to make it easy to contribute financially to the DOXA campaign</li>
        </ul>

        <h3 style="color: #3B463D; font-size: 18px; margin: 30px 0 15px; font-weight: 600;">3. Your First 30 Days</h3>
        <p style="font-size: 16px; margin: 0 0 15px; color: #3B463D;">
          To help you move from adoption to action, we ask that you focus on these three steps this month:
        </p>

        <div style="background: #f4f6f4; border-left: 4px solid #3B463D; padding: 15px 20px; margin: 15px 0; border-radius: 0 5px 5px 0;">
          <p style="font-size: 15px; margin: 0; color: #3B463D;">
            <strong>Internalize:</strong> Pray 10 minutes daily for the ${peopleGroupName}. Ask God to give you a heart for this place and these people. Ask Him to give you wisdom for the next steps and favor with all who will hear because of your efforts to share the vision. Ask Him to prepare hearts. Expect Him to answer &mdash; He is already at work!
          </p>
        </div>

        <div style="background: #f4f6f4; border-left: 4px solid #3B463D; padding: 15px 20px; margin: 15px 0; border-radius: 0 5px 5px 0;">
          <p style="font-size: 15px; margin: 0; color: #3B463D;">
            <strong>Strategize and Socialize:</strong> Make a plan with your church leadership on how to introduce this to your church and community. Share your digital media and other resources found in your mobilization toolkit with your church family and on your social platforms. Let people know that this group is your focus.
          </p>
        </div>

        <div style="background: #f4f6f4; border-left: 4px solid #3B463D; padding: 15px 20px; margin: 15px 0; border-radius: 0 5px 5px 0;">
          <p style="font-size: 15px; margin: 0; color: #3B463D;">
            <strong>Mobilize Core:</strong> Identify 5 people who will sign up to pray with you. Consider prayer leaders, small group members, and spiritually faithful friends who are likely to be aligned in priorities and vision. A small core in sustained, expectant agreement can be the beginning of a movement.
          </p>
        </div>

        <h3 style="color: #3B463D; font-size: 18px; margin: 30px 0 15px; font-weight: 600;">4. Be Encouraged by DOXA Updates</h3>
        <p style="font-size: 16px; margin: 0 0 10px; color: #3B463D;">
          Every month, you will receive a strategic monthly update &mdash; briefing you on any regional breakthroughs, new resources, or mobilization milestones related to your group. If you have questions, need encouragement, or help thinking through next steps, we want to help. Please reach out to <a href="mailto:contact@doxa.life" style="color: #3B463D; text-decoration: underline;">contact@doxa.life</a>.
        </p>

        <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 30px 0;" />

        <p style="font-size: 16px; margin: 20px 0; color: #3B463D;">
          There were ${beforeCount} groups left to adopt. Because of your &ldquo;yes&rdquo; today, that number is now ${afterCount}. Keep going.
        </p>

        <p style="font-size: 16px; margin: 20px 0 5px; color: #3B463D;">
          To the Glory of God,
        </p>
        <p style="font-size: 16px; margin: 0; color: #3B463D;">
          The DOXA Team<br />
          <a href="https://doxa.life" style="color: #3B463D; text-decoration: underline;">doxa.life</a>
        </p>
      </div>

      <div style="text-align: center; margin-top: 20px; padding: 20px; color: #666666; font-size: 12px;">
        <p style="margin: 0;">This is an automated message from ${appName}</p>
      </div>
    </body>
    </html>
  `

  const text = `
DOXA Briefing: Your Commitment to the ${data.peopleGroupName}

Dear ${data.firstName},

Today, as part of the DOXA partnership, you changed the status of the ${data.peopleGroupName} from waiting to adopted, the vital first step to engagement. You are now a primary advocate, intercessor, and mobilizer for a people group who, until this moment, had no consistent witness or dedicated prayer effort.

The following resources will help you steward this opportunity.

1. WHO YOU ARE STANDING FOR

  People Group Full Profile: ${profileUrl}
${externalLinksText ? '\n' + externalLinksText + '\n' : ''}
2. YOUR MOBILIZATION TOOLKIT

You don't have to start from scratch. Access resources at ${resourcesUrl}:
- URL and QR code to your people group, tips, answers to frequently asked questions, and more
- Images to help you introduce this to your church or small group
- A dedicated link to make it easy to contribute financially to the DOXA campaign

3. YOUR FIRST 30 DAYS

To help you move from adoption to action, we ask that you focus on these three steps this month:

Internalize: Pray 10 minutes daily for the ${data.peopleGroupName}. Ask God to give you a heart for this place and these people. Ask Him to give you wisdom for the next steps and favor with all who will hear because of your efforts to share the vision. Ask Him to prepare hearts. Expect Him to answer - He is already at work!

Strategize and Socialize: Make a plan with your church leadership on how to introduce this to your church and community. Share your digital media and other resources found in your mobilization toolkit with your church family and on your social platforms. Let people know that this group is your focus.

Mobilize Core: Identify 5 people who will sign up to pray with you. Consider prayer leaders, small group members, and spiritually faithful friends who are likely to be aligned in priorities and vision. A small core in sustained, expectant agreement can be the beginning of a movement.

4. BE ENCOURAGED BY DOXA UPDATES

Every month, you will receive a strategic monthly update - briefing you on any regional breakthroughs, new resources, or mobilization milestones related to your group. If you have questions, need encouragement, or help thinking through next steps, we want to help. Please reach out to contact@doxa.life.

---

There were ${beforeCount} groups left to adopt. Because of your "yes" today, that number is now ${afterCount}. Keep going.

To the Glory of God,
The DOXA Team
doxa.life

---
This is an automated message from ${appName}
  `.trim()

  return await sendEmail({
    to: data.to,
    subject,
    html,
    text
  })
}
