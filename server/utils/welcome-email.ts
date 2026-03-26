import { t, localePath } from './translations'
import { generateGoogleCalendarUrl, getIcsDownloadUrl } from './calendar-links'

export interface WelcomeEmailCalendarOptions {
  subscriptionId: number
  frequency: string
  daysOfWeek?: number[]
  timezone: string
  prayerDuration: number
}

export async function sendWelcomeEmail(
  to: string,
  subscriberName: string,
  peopleGroupName: string,
  peopleGroupSlug: string,
  profileId: string,
  locale: string = 'en',
  trackingId?: string,
  reminderTime?: string,
  calendarOptions?: WelcomeEmailCalendarOptions
): Promise<boolean> {
  const config = useRuntimeConfig()
  const baseUrl = config.public.siteUrl || 'http://localhost:3000'
  const appName = config.appName || 'Doxa'
  const prayerPath = localePath(`/${peopleGroupSlug}/prayer`, locale)
  const peopleGroupUrl = trackingId ? `${baseUrl}${prayerPath}?uid=${trackingId}` : `${baseUrl}${prayerPath}`
  const profileUrl = `${baseUrl}${localePath('/subscriber', locale)}?id=${profileId}`

  const subject = t('email.welcome.subject', locale, { appName, campaign: peopleGroupName })
  const header = t('email.welcome.header', locale, { appName })
  const hello = t('email.common.hello', locale, { name: subscriberName })
  const doxaMeaning = t('email.welcome.doxaMeaning', locale)
  const reminderExplanation = t('email.welcome.reminderExplanation', locale)
  const sharedGoal = t('email.welcome.sharedGoal', locale)
  const closing = t('email.welcome.closing', locale)
  const startPraying = t('email.welcome.startPraying', locale)
  const profileInstructions = t('email.welcome.profileInstructions', locale)
  const managePreferences = t('email.common.managePreferences', locale)
  const automatedMessage = t('email.common.automatedMessage', locale, { appName })
  const reminderTimeText = reminderTime
    ? t('email.welcome.reminderTimeNote', locale, { time: reminderTime })
    : ''

  // Calendar links
  let calendarHtml = ''
  let calendarText = ''
  if (calendarOptions && reminderTime) {
    const addToCalendarLabel = t('email.welcome.addToCalendar', locale)
    const googleLabel = t('email.welcome.googleCalendar', locale)
    const icsLabel = t('email.welcome.otherCalendars', locale)

    const googleUrl = generateGoogleCalendarUrl({
      title: t('calendar.eventTitle', locale, { campaign: peopleGroupName }),
      description: t('calendar.eventDescription', locale, { duration: calendarOptions.prayerDuration, campaign: peopleGroupName }),
      frequency: calendarOptions.frequency,
      daysOfWeek: calendarOptions.daysOfWeek,
      timePreference: reminderTime,
      timezone: calendarOptions.timezone,
      durationMinutes: calendarOptions.prayerDuration,
      url: peopleGroupUrl
    })
    const icsUrl = getIcsDownloadUrl(calendarOptions.subscriptionId, profileId, baseUrl)

    calendarHtml = `
        <div style="text-align: center; margin: 20px 0;">
          <p style="font-size: 14px; color: #3B463D; margin-bottom: 12px; font-weight: 500;">
            ${addToCalendarLabel}
          </p>
          <a href="${googleUrl}" style="
            background: #ffffff;
            color: #3B463D;
            padding: 10px 18px;
            text-decoration: none;
            border-radius: 5px;
            font-weight: 500;
            font-size: 13px;
            display: inline-block;
            border: 1px solid #3B463D;
            margin: 0 4px;
          ">${googleLabel}</a>
          <a href="${icsUrl}" style="
            background: #ffffff;
            color: #3B463D;
            padding: 10px 18px;
            text-decoration: none;
            border-radius: 5px;
            font-weight: 500;
            font-size: 13px;
            display: inline-block;
            border: 1px solid #3B463D;
            margin: 0 4px;
          ">${icsLabel}</a>
        </div>`

    calendarText = `\n${addToCalendarLabel}\n${googleLabel}: ${googleUrl}\n${icsLabel}: ${icsUrl}\n`
  }

  const html = `
    <!DOCTYPE html>
    <html lang="${locale}">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #3B463D; background: #ffffff; max-width: 600px; margin: 0 auto; padding: 20px;">
      <img src="${baseUrl}/images/template-header-doxa.jpeg" alt="Doxa" style="width: 100%; display: block; border-radius: 10px 10px 0 0;" />
      <div style="background: #3B463D; color: #ffffff; padding: 30px; text-align: center;">
        <h1 style="margin: 0; font-size: 28px; font-weight: 500;">${header}</h1>
        <p style="margin: 10px 0 0; font-size: 16px; opacity: 0.8;">${peopleGroupName}</p>
      </div>

      <div style="background: #ffffff; border: 2px solid #3B463D; border-top: none; padding: 40px 30px; border-radius: 0 0 10px 10px;">
        <h2 style="color: #3B463D; margin-top: 0; font-weight: 500;">${hello}</h2>
        <p style="font-size: 16px; margin: 20px 0; color: #3B463D;">
          ${doxaMeaning}
        </p>
        <p style="font-size: 16px; margin: 20px 0; color: #3B463D;">
          ${reminderExplanation}
        </p>
        <p style="font-size: 16px; margin: 20px 0; color: #3B463D;">
          ${sharedGoal}
        </p>
        <p style="font-size: 16px; margin: 20px 0; color: #3B463D;">
          ${closing}
        </p>
${reminderTimeText ? `
        <div style="background: #f4f6f4; border-left: 4px solid #3B463D; padding: 15px 20px; margin: 25px 0; border-radius: 0 5px 5px 0;">
          <p style="font-size: 15px; margin: 0; color: #3B463D; font-weight: 500;">
            ${reminderTimeText}
          </p>
        </div>
` : ''}${calendarHtml}
        <div style="text-align: center; margin: 30px 0;">
          <a href="${peopleGroupUrl}" style="
            background: #3B463D;
            color: #ffffff;
            padding: 15px 30px;
            text-decoration: none;
            border-radius: 5px;
            font-weight: 500;
            font-size: 16px;
            display: inline-block;
            text-align: center;
            border: 2px solid #3B463D;
          ">${startPraying}</a>
        </div>

        <p style="color: #666666; font-size: 14px; margin-top: 30px;">
          ${profileInstructions}
        </p>

        <div style="text-align: center; margin: 20px 0;">
          <a href="${profileUrl}" style="
            background: #ffffff;
            color: #3B463D;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 5px;
            font-weight: 500;
            font-size: 14px;
            display: inline-block;
            text-align: center;
            border: 2px solid #3B463D;
          ">${managePreferences}</a>
        </div>

      </div>

      <div style="text-align: center; margin-top: 20px; padding: 20px; color: #666666; font-size: 12px;">
        <p style="margin: 0;">${automatedMessage}</p>
      </div>
    </body>
    </html>
  `

  const text = `
${header} - ${peopleGroupName}

${hello}

${doxaMeaning}

${reminderExplanation}

${sharedGoal}

${closing}
${reminderTimeText ? `\n${reminderTimeText}\n` : ''}${calendarText}
${startPraying}: ${peopleGroupUrl}

${managePreferences}: ${profileUrl}

${automatedMessage}
  `.trim()

  return await sendEmail({
    to,
    subject,
    html,
    text
  })
}
