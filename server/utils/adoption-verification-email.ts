import { t, localePath } from './translations'

export async function sendAdoptionVerificationEmail(
  to: string,
  verificationToken: string,
  peopleGroupName: string,
  subscriberName: string,
  locale: string = 'en'
): Promise<boolean> {
  const config = useRuntimeConfig()
  const baseUrl = config.public.siteUrl || 'http://localhost:3000'
  const appName = config.appName || 'DOXA Prayer'
  const verificationUrl = `${baseUrl}${localePath('/adoption/verify', locale)}?token=${verificationToken}`

  const subject = t('email.adoptionVerification.subject', locale, { peopleGroupName })
  const header = t('email.adoptionVerification.header', locale)
  const hello = t('email.common.hello', locale, { name: subscriberName })
  const thankYou = t('email.adoptionVerification.thankYou', locale, { peopleGroupName })
  const pleaseVerify = t('email.adoptionVerification.pleaseVerify', locale)
  const verifyButton = t('email.adoptionVerification.verifyButton', locale)
  const linkInstructions = t('email.adoptionVerification.linkInstructions', locale)
  const note = t('email.adoptionVerification.note', locale)
  const expiration = t('email.adoptionVerification.expiration', locale)
  const ignoreMessage = t('email.adoptionVerification.ignoreMessage', locale)
  const automatedMessage = t('email.common.automatedMessage', locale, { appName })

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
          ${thankYou}
        </p>

        <p style="font-size: 16px; margin: 20px 0; color: #3B463D;">
          ${pleaseVerify}
        </p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" style="
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
          ">${verifyButton}</a>
        </div>

        <p style="color: #666666; font-size: 14px; margin-top: 30px;">
          ${linkInstructions}
        </p>
        <p style="background: #f5f5f5; border: 1px solid #cccccc; padding: 10px; border-radius: 4px; word-break: break-all; font-size: 14px; color: #333333;">
          ${verificationUrl}
        </p>

        <p style="color: #666666; font-size: 14px; margin-top: 30px;">
          <strong>${note}</strong> ${expiration}
        </p>

        <p style="color: #666666; font-size: 14px; margin-top: 20px;">
          ${ignoreMessage}
        </p>
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

${thankYou}

${pleaseVerify}
${verificationUrl}

${note} ${expiration}

${ignoreMessage}

${automatedMessage}
  `.trim()

  return await sendEmail({
    to,
    subject,
    html,
    text
  })
}
