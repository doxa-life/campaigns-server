import { t } from './translations'

export interface AdoptionWelcomeEmailData {
  to: string
  firstName: string
  peopleGroupName: string
  peopleGroupSlug: string
  joshuaProjectId: string | null
  imbPeid: string | null
  remainingGroupsCount: number
  locale?: string
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
  const locale = data.locale || 'en'

  const firstName = escapeHtml(data.firstName)
  const peopleGroupName = escapeHtml(data.peopleGroupName)
  const slug = encodeURIComponent(data.peopleGroupSlug)

  const profileUrl = `${siteUrl}/${slug}`
  const resourcesUrl = `https://doxa.life/research/${slug}/resources/`
  const contactEmail = 'contact@doxa.life'

  const joshuaProjectUrl = data.joshuaProjectId
    ? `https://joshuaproject.net/people_groups/${encodeURIComponent(data.joshuaProjectId)}`
    : null
  const peoplegroupsOrgUrl = data.imbPeid
    ? `https://peoplegroups.org/people_groups/${encodeURIComponent(data.imbPeid)}/`
    : null

  const beforeCount = (data.remainingGroupsCount + 1).toLocaleString()
  const afterCount = data.remainingGroupsCount.toLocaleString()

  const params = { peopleGroupName: data.peopleGroupName, firstName: data.firstName }

  const subject = t('email.adoptionWelcome.subject', locale, params)
  const headerTitle = t('email.adoptionWelcome.headerTitle', locale)
  const greeting = t('email.adoptionWelcome.greeting', locale, params)
  const intro = t('email.adoptionWelcome.intro', locale, params)
  const resourcesIntro = t('email.adoptionWelcome.resourcesIntro', locale)
  const section1Title = t('email.adoptionWelcome.section1Title', locale)
  const profileButton = t('email.adoptionWelcome.profileButton', locale)
  const learnMore = t('email.adoptionWelcome.learnMore', locale)
  const section2Title = t('email.adoptionWelcome.section2Title', locale)
  const resourcesPlaceholder = '{{RESOURCES_LINK}}'
  const section2IntroRaw = t('email.adoptionWelcome.section2Intro', locale, { resourcesUrl: resourcesPlaceholder })
  const section2IntroHtml = escapeHtml(section2IntroRaw).replace(
    escapeHtml(resourcesPlaceholder),
    `<a href="${resourcesUrl}" style="color: #3B463D; text-decoration: underline;">${escapeHtml(resourcesUrl)}</a>`
  )
  const section2Intro = t('email.adoptionWelcome.section2Intro', locale, { resourcesUrl })
  const section2Item1 = t('email.adoptionWelcome.section2Item1', locale)
  const section2Item2 = t('email.adoptionWelcome.section2Item2', locale)
  const section2Item3 = t('email.adoptionWelcome.section2Item3', locale)
  const section3Title = t('email.adoptionWelcome.section3Title', locale)
  const section3Intro = t('email.adoptionWelcome.section3Intro', locale)
  const step1Label = t('email.adoptionWelcome.step1Label', locale)
  const step1Text = t('email.adoptionWelcome.step1Text', locale, params)
  const step2Label = t('email.adoptionWelcome.step2Label', locale)
  const step2Text = t('email.adoptionWelcome.step2Text', locale)
  const step3Label = t('email.adoptionWelcome.step3Label', locale)
  const step3Text = t('email.adoptionWelcome.step3Text', locale, params)
  const section4Title = t('email.adoptionWelcome.section4Title', locale)
  const section4Text = t('email.adoptionWelcome.section4Text', locale, { contactEmail })
  const closingCount = t('email.adoptionWelcome.closingCount', locale, { beforeCount, afterCount })
  const signoff = t('email.adoptionWelcome.signoff', locale)
  const teamName = t('email.adoptionWelcome.teamName', locale)
  const automatedMessage = t('email.common.automatedMessage', locale, { appName })

  const dir = locale === 'ar' ? 'rtl' : 'ltr'

  const externalLinksHtml = (peoplegroupsOrgUrl || joshuaProjectUrl) ? `
        <p style="font-size: 14px; color: #666666; margin: 15px 0 0;">
          ${escapeHtml(learnMore)}
          ${peoplegroupsOrgUrl ? `<a href="${peoplegroupsOrgUrl}" style="color: #3B463D; text-decoration: underline;">Peoplegroups.org</a>` : ''}
          ${peoplegroupsOrgUrl && joshuaProjectUrl ? ' | ' : ''}
          ${joshuaProjectUrl ? `<a href="${joshuaProjectUrl}" style="color: #3B463D; text-decoration: underline;">Joshua Project</a>` : ''}
        </p>` : ''

  const externalLinksText = [
    peoplegroupsOrgUrl ? `  Peoplegroups.org: ${peoplegroupsOrgUrl}` : '',
    joshuaProjectUrl ? `  Joshua Project: ${joshuaProjectUrl}` : ''
  ].filter(Boolean).join('\n')

  const html = `
    <!DOCTYPE html>
    <html lang="${locale}" dir="${dir}">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapeHtml(subject)}</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #3B463D; background: #ffffff; max-width: 600px; margin: 0 auto; padding: 20px; direction: ${dir};">
      <img src="${siteUrl}/images/template-header-doxa.jpeg" alt="DOXA" style="width: 100%; display: block; border-radius: 10px 10px 0 0;" />
      <div style="background: #3B463D; color: #ffffff; padding: 30px; text-align: center;">
        <h1 style="margin: 0; font-size: 28px; font-weight: 500;">${escapeHtml(headerTitle)}</h1>
        <p style="margin: 10px 0 0; font-size: 16px; opacity: 0.8;">${peopleGroupName}</p>
      </div>

      <div style="background: #ffffff; border: 2px solid #3B463D; border-top: none; padding: 40px 30px; border-radius: 0 0 10px 10px;">
        <h2 style="color: #3B463D; margin-top: 0; font-weight: 500;">${escapeHtml(greeting)}</h2>

        <p style="font-size: 16px; margin: 20px 0; color: #3B463D;">
          ${escapeHtml(intro)}
        </p>

        <p style="font-size: 16px; margin: 20px 0; color: #3B463D;">
          ${escapeHtml(resourcesIntro)}
        </p>

        <h3 style="color: #3B463D; font-size: 18px; margin: 30px 0 15px; font-weight: 600;">${escapeHtml(section1Title)}</h3>
        <div style="text-align: center; margin: 20px 0;">
          <a href="${profileUrl}" style="background: #3B463D; color: #ffffff; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: 500; font-size: 16px; display: inline-block; border: 2px solid #3B463D;">${escapeHtml(profileButton)}</a>
        </div>
${externalLinksHtml}

        <h3 style="color: #3B463D; font-size: 18px; margin: 30px 0 15px; font-weight: 600;">${escapeHtml(section2Title)}</h3>
        <p style="font-size: 16px; margin: 0 0 10px; color: #3B463D;">
          ${section2IntroHtml}
        </p>
        <ul style="font-size: 15px; color: #3B463D; margin: 10px 0 20px; padding-${dir === 'rtl' ? 'right' : 'left'}: 20px;">
          <li style="margin-bottom: 8px;">${escapeHtml(section2Item1)}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(section2Item2)}</li>
          <li style="margin-bottom: 8px;">${escapeHtml(section2Item3)}</li>
        </ul>

        <h3 style="color: #3B463D; font-size: 18px; margin: 30px 0 15px; font-weight: 600;">${escapeHtml(section3Title)}</h3>
        <p style="font-size: 16px; margin: 0 0 15px; color: #3B463D;">
          ${escapeHtml(section3Intro)}
        </p>

        <div style="background: #f4f6f4; border-${dir === 'rtl' ? 'right' : 'left'}: 4px solid #3B463D; padding: 15px 20px; margin: 15px 0; border-radius: ${dir === 'rtl' ? '5px 0 0 5px' : '0 5px 5px 0'};">
          <p style="font-size: 15px; margin: 0; color: #3B463D;">
            <strong>${escapeHtml(step1Label)}</strong> ${escapeHtml(step1Text)}
          </p>
        </div>

        <div style="background: #f4f6f4; border-${dir === 'rtl' ? 'right' : 'left'}: 4px solid #3B463D; padding: 15px 20px; margin: 15px 0; border-radius: ${dir === 'rtl' ? '5px 0 0 5px' : '0 5px 5px 0'};">
          <p style="font-size: 15px; margin: 0; color: #3B463D;">
            <strong>${escapeHtml(step2Label)}</strong> ${escapeHtml(step2Text)}
          </p>
        </div>

        <div style="background: #f4f6f4; border-${dir === 'rtl' ? 'right' : 'left'}: 4px solid #3B463D; padding: 15px 20px; margin: 15px 0; border-radius: ${dir === 'rtl' ? '5px 0 0 5px' : '0 5px 5px 0'};">
          <p style="font-size: 15px; margin: 0; color: #3B463D;">
            <strong>${escapeHtml(step3Label)}</strong> ${escapeHtml(step3Text)}
          </p>
        </div>

        <h3 style="color: #3B463D; font-size: 18px; margin: 30px 0 15px; font-weight: 600;">${escapeHtml(section4Title)}</h3>
        <p style="font-size: 16px; margin: 0 0 10px; color: #3B463D;">
          ${escapeHtml(section4Text)}
        </p>

        <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 30px 0;" />

        <p style="font-size: 16px; margin: 20px 0; color: #3B463D;">
          ${escapeHtml(closingCount)}
        </p>

        <p style="font-size: 16px; margin: 20px 0 5px; color: #3B463D;">
          ${escapeHtml(signoff)}
        </p>
        <p style="font-size: 16px; margin: 0; color: #3B463D;">
          ${escapeHtml(teamName)}<br />
          <a href="https://doxa.life" style="color: #3B463D; text-decoration: underline;">doxa.life</a>
        </p>
      </div>

      <div style="text-align: center; margin-top: 20px; padding: 20px; color: #666666; font-size: 12px;">
        <p style="margin: 0;">${escapeHtml(automatedMessage)}</p>
      </div>
    </body>
    </html>
  `

  const text = `
${subject}

${greeting}

${intro}

${resourcesIntro}

${section1Title.toUpperCase()}

  ${profileButton}: ${profileUrl}
${externalLinksText ? '\n' + externalLinksText + '\n' : ''}
${section2Title.toUpperCase()}

${section2Intro}
- ${section2Item1}
- ${section2Item2}
- ${section2Item3}

${section3Title.toUpperCase()}

${section3Intro}

${step1Label} ${step1Text}

${step2Label} ${step2Text}

${step3Label} ${step3Text}

${section4Title.toUpperCase()}

${section4Text}

---

${closingCount}

${signoff}
${teamName}
doxa.life

---
${automatedMessage}
  `.trim()

  return await sendEmail({
    to: data.to,
    subject,
    html,
    text
  })
}
