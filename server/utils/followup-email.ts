import { t, localePath } from './translations'

export interface FollowupEmailData {
  to: string
  subscriberName: string
  peopleGroupName: string
  peopleGroupSlug: string
  subscriptionId: number
  profileId: string
  frequency: 'daily' | 'weekly' | string
  daysOfWeek?: number[]
  isReminder?: boolean
  locale?: string
}

function getDayNames(daysOfWeek: number[], locale: string = 'en'): string {
  const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  return daysOfWeek.map(d => t(`email.days.${dayKeys[d]}`, locale)).join(', ')
}

function getQuestionText(frequency: string, locale: string = 'en', daysOfWeek?: number[]): {
  question: string
  committedText: string
  sometimesText: string
  notPrayingText: string
} {
  if (frequency === 'daily') {
    return {
      question: t('email.followup.questionDaily', locale),
      committedText: t('email.followup.yesDaily', locale),
      sometimesText: t('email.followup.sometimes', locale),
      notPrayingText: t('email.followup.noLonger', locale)
    }
  } else {
    const days = daysOfWeek && daysOfWeek.length > 0 ? getDayNames(daysOfWeek, locale) : ''
    return {
      question: t('email.followup.questionWeekly', locale, { days }),
      committedText: t('email.followup.yesWeekly', locale),
      sometimesText: t('email.followup.sometimesWeekly', locale),
      notPrayingText: t('email.followup.noLonger', locale)
    }
  }
}

export async function sendFollowupEmail(data: FollowupEmailData): Promise<boolean> {
  const config = useRuntimeConfig()
  const baseUrl = config.public.siteUrl || 'http://localhost:3000'
  const appName = config.appName || 'Prayer Tools'
  const locale = data.locale || 'en'

  const profileUrl = `${baseUrl}${localePath('/subscriber', locale)}?id=${data.profileId}`

  // Build response URLs (include profile_id for authentication)
  const buildResponseUrl = (response: string) =>
    `${baseUrl}${localePath('/followup', locale)}?sid=${data.subscriptionId}&response=${response}&id=${data.profileId}`

  const committedUrl = buildResponseUrl('committed')
  const sometimesUrl = buildResponseUrl('sometimes')
  const notPrayingUrl = buildResponseUrl('not_praying')

  // Get frequency-aware question text
  const questionText = getQuestionText(data.frequency, locale, data.daysOfWeek)

  const subject = data.isReminder
    ? t('email.followup.subjectReminder', locale, { campaign: data.peopleGroupName })
    : t('email.followup.subject', locale, { campaign: data.peopleGroupName })

  const header = t('email.followup.header', locale)
  const hello = t('email.common.hello', locale, { name: data.subscriberName })
  const introText = data.isReminder
    ? t('email.followup.reminderIntro', locale)
    : t('email.followup.standardIntro', locale)
  const feedbackHelps = t('email.followup.feedbackHelps', locale)
  const pauseNotice = t('email.followup.pauseNotice', locale)
  const commitmentCheckIn = t('email.followup.commitmentCheckIn', locale, { appName })
  const managePrayerTimes = t('email.common.managePrayerTimes', locale)

  const buttonStyle = `
    display: block;
    width: 280px;
    padding: 14px 24px;
    margin: 10px auto;
    text-decoration: none;
    border-radius: 6px;
    font-weight: 500;
    font-size: 14px;
    text-align: center;
    box-sizing: border-box;
  `

  const html = `
    <!DOCTYPE html>
    <html lang="${locale}">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${header} - ${data.peopleGroupName}</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #3B463D; background: #ffffff; max-width: 600px; margin: 0 auto; padding: 20px;">
      <img src="${baseUrl}/images/template-header-doxa.jpeg" alt="Doxa" style="width: 100%; display: block; border-radius: 10px 10px 0 0;" />
      <div style="background: #3B463D; color: #ffffff; padding: 30px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px; font-weight: 500;">${header}</h1>
        <p style="margin: 10px 0 0; font-size: 16px; opacity: 0.8;">${data.peopleGroupName}</p>
      </div>

      <div style="background: #ffffff; border: 2px solid #3B463D; border-top: none; padding: 40px 30px; border-radius: 0 0 10px 10px;">
        <h2 style="color: #3B463D; margin-top: 0; font-weight: 500;">${hello}</h2>

        <p style="font-size: 16px; margin: 20px 0; color: #3B463D;">
          ${introText}
        </p>

        <p style="font-size: 18px; margin: 30px 0 20px; color: #3B463D; font-weight: 500; text-align: center;">
          ${questionText.question}
        </p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${committedUrl}" style="${buttonStyle} background: #3B463D; color: #ffffff; border: 2px solid #3B463D;">
            ${questionText.committedText}
          </a>
          <a href="${sometimesUrl}" style="${buttonStyle} background: #ffffff; color: #3B463D; border: 2px solid #3B463D;">
            ${questionText.sometimesText}
          </a>
          <a href="${notPrayingUrl}" style="${buttonStyle} background: #f5f5f5; color: #666666; border: 2px solid #cccccc;">
            ${questionText.notPrayingText}
          </a>
        </div>

        <p style="font-size: 14px; color: #666666; margin-top: 30px; text-align: center;">
          ${feedbackHelps}
        </p>

        <p style="font-size: 13px; color: #999999; margin-top: 20px; text-align: center; font-style: italic;">
          ${pauseNotice}
        </p>
      </div>

      <div style="text-align: center; margin-top: 30px;">
        <a href="${profileUrl}" style="
          display: inline-block;
          background: #ffffff;
          color: #3B463D;
          padding: 12px 24px;
          text-decoration: none;
          border-radius: 5px;
          font-weight: 500;
          font-size: 14px;
          border: 2px solid #3B463D;
        ">${managePrayerTimes}</a>
      </div>

      <div style="text-align: center; margin-top: 16px; padding: 20px; color: #666666; font-size: 12px;">
        <p style="margin: 0;">${commitmentCheckIn}</p>
      </div>
    </body>
    </html>
  `

  const text = `
${header} - ${data.peopleGroupName}

${hello}

${introText}

${questionText.question}

- ${questionText.committedText}: ${committedUrl}
- ${questionText.sometimesText}: ${sometimesUrl}
- ${questionText.notPrayingText}: ${notPrayingUrl}

${feedbackHelps}

${pauseNotice}

---
${managePrayerTimes}: ${profileUrl}

${commitmentCheckIn}
  `.trim()

  return await sendEmail({
    to: data.to,
    subject,
    html,
    text
  })
}
