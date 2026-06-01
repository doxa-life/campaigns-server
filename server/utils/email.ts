import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import mailgunTransport from 'nodemailer-mailgun-transport'
import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses'
import { renderEmailTemplate, type EmailTemplateData } from './email-templates'

// Determine environment
const isDevelopment = (process.env.NODE_ENV || 'development') === 'development'

// Lazy transporter initialization
let transporter: Transporter | null = null
let sesClient: SESClient | null = null

// Get email configuration from environment variables
function getEmailConfig() {
  try {
    const config = useRuntimeConfig()
    return {
      // Provider selection: 'smtp', 'mailgun', or 'ses'
      provider: config.emailProvider || process.env.EMAIL_PROVIDER || 'smtp',
      // Mailgun config
      mailgunApiKey: config.mailgunApiKey || process.env.MAILGUN_API_KEY,
      mailgunDomain: config.mailgunDomain || process.env.MAILGUN_DOMAIN,
      mailgunHost: config.mailgunHost || process.env.MAILGUN_HOST, // 'api.eu.mailgun.net' for EU
      // SES config
      awsRegion: config.awsRegion || process.env.AWS_REGION || process.env.AWS_SES_REGION,
      awsAccessKeyId: config.awsAccessKeyId || process.env.AWS_ACCESS_KEY_ID,
      awsSecretAccessKey: config.awsSecretAccessKey || process.env.AWS_SECRET_ACCESS_KEY,
      // SMTP config (fallback)
      smtpHost: config.smtpHost || process.env.SMTP_HOST,
      smtpPort: config.smtpPort || process.env.SMTP_PORT || '587',
      smtpUser: config.smtpUser || process.env.SMTP_USER,
      smtpPass: config.smtpPass || process.env.SMTP_PASS,
      smtpSecure: config.smtpSecure || process.env.SMTP_SECURE || 'false',
      smtpRejectUnauthorized: config.smtpRejectUnauthorized || process.env.SMTP_REJECT_UNAUTHORIZED || 'true',
      // Common config
      smtpFrom: config.smtpFrom || process.env.SMTP_FROM,
      smtpFromName: config.smtpFromName || process.env.SMTP_FROM_NAME,
      appName: config.appName || process.env.APP_NAME
    }
  } catch {
    // Fallback to process.env only
    return {
      provider: process.env.EMAIL_PROVIDER || 'smtp',
      mailgunApiKey: process.env.MAILGUN_API_KEY,
      mailgunDomain: process.env.MAILGUN_DOMAIN,
      mailgunHost: process.env.MAILGUN_HOST,
      awsRegion: process.env.AWS_REGION || process.env.AWS_SES_REGION,
      awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
      awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      smtpHost: process.env.SMTP_HOST,
      smtpPort: process.env.SMTP_PORT || '587',
      smtpUser: process.env.SMTP_USER,
      smtpPass: process.env.SMTP_PASS,
      smtpSecure: process.env.SMTP_SECURE || 'false',
      smtpRejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED || 'true',
      smtpFrom: process.env.SMTP_FROM,
      smtpFromName: process.env.SMTP_FROM_NAME,
      appName: process.env.APP_NAME
    }
  }
}

function getTransporter(): Transporter {
  if (transporter) {
    return transporter
  }

  const config = getEmailConfig()

  // Development mode: Use MailHog
  if (isDevelopment) {
    console.log('[Email] Using MailHog (development mode)')
    transporter = nodemailer.createTransport({
      host: 'localhost',
      port: 1025,
      secure: false,
      tls: { rejectUnauthorized: false }
    })
    return transporter
  }

  const provider = config.provider.toLowerCase()

  switch (provider) {
    case 'mailgun': {
      // Validate Mailgun config
      if (!config.mailgunApiKey || !config.mailgunDomain) {
        throw new Error('Mailgun configuration incomplete. Set MAILGUN_API_KEY and MAILGUN_DOMAIN.')
      }

      console.log('[Email] Using Mailgun HTTP API')
      const mailgunOptions: any = {
        auth: {
          api_key: config.mailgunApiKey,
          domain: config.mailgunDomain
        }
      }

      // Support EU region
      if (config.mailgunHost) {
        mailgunOptions.host = config.mailgunHost
      }

      transporter = nodemailer.createTransport(mailgunTransport(mailgunOptions))
      break
    }

    case 'ses': {
      // Validate SES config
      if (!config.awsRegion || !config.awsAccessKeyId || !config.awsSecretAccessKey) {
        throw new Error('AWS SES configuration incomplete. Set AWS_REGION, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY.')
      }

      console.log('[Email] Using AWS SES')
      sesClient = new SESClient({
        region: config.awsRegion,
        credentials: {
          accessKeyId: config.awsAccessKeyId,
          secretAccessKey: config.awsSecretAccessKey
        }
      })

      // Create a nodemailer transporter that uses SES
      transporter = nodemailer.createTransport({
        SES: { ses: sesClient, aws: { SendRawEmailCommand } }
      } as any)
      break
    }

    case 'smtp':
    default: {
      // Validate SMTP config
      if (!config.smtpHost || !config.smtpUser || !config.smtpPass) {
        throw new Error('SMTP configuration incomplete. Set SMTP_HOST, SMTP_USER, and SMTP_PASS.')
      }

      console.log('[Email] Using SMTP')
      transporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: parseInt(config.smtpPort),
        secure: config.smtpSecure === 'true',
        auth: {
          user: config.smtpUser,
          pass: config.smtpPass
        },
        tls: {
          rejectUnauthorized: config.smtpRejectUnauthorized !== 'false'
        }
      })
      break
    }
  }

  return transporter
}

export interface EmailOptions {
  to: string | string[]
  subject: string
  html: string
  text?: string
  from?: string
}

export interface TemplateEmailOptions {
  to: string | string[]
  template: 'test' | 'welcome' | 'notification' | 'bulk' | 'verification' | 'emailChangeVerification' | 'passwordReset' | 'commentNotification' | 'subscriberCommentNotification' | 'entryClaimedNotification' | 'dailySummary'
  data: EmailTemplateData
  from?: string
  subject?: string
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    const config = getEmailConfig()

    // Build from address
    let fromEmail = options.from
    if (!fromEmail) {
      const fromName = config.smtpFromName || config.appName
      const fromAddress = isDevelopment
        ? 'noreply@localhost.local'
        : (config.smtpFrom || 'noreply@yourdomain.com')
      fromEmail = fromName ? `${fromName} <${fromAddress}>` : fromAddress
    }

    const mailOptions = {
      from: fromEmail,
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || options.html.replace(/<[^>]*>/g, '')
    }

    const info = await getTransporter().sendMail(mailOptions)
    console.log('[Email] Sent successfully:', info.messageId)

    if (isDevelopment) {
      console.log('[Email] Development mode: View at http://localhost:8025')
    } else {
      const provider = config.provider.toLowerCase()
      console.log(`[Email] Sent via ${provider.toUpperCase()}`)
    }

    return true
  } catch (error) {
    if (!process.env.VITEST) {
      console.error('[Email] Error sending:', error)
    }
    return false
  }
}

export async function sendBulkEmails(emails: EmailOptions[]): Promise<{ success: number; failed: number }> {
  let success = 0
  let failed = 0

  for (const email of emails) {
    const result = await sendEmail(email)
    if (result) {
      success++
    } else {
      failed++
    }
  }

  return { success, failed }
}

export async function sendTemplateEmail(options: TemplateEmailOptions): Promise<boolean> {
  try {
    const config = getEmailConfig()
    const appName = config.appName || 'Base'

    const templateData = {
      ...options.data,
      appName
    }

    const { subject, html, text } = renderEmailTemplate(options.template, templateData)

    return await sendEmail({
      to: options.to,
      subject: options.subject || subject,
      html,
      text,
      from: options.from
    })
  } catch (error) {
    if (!process.env.VITEST) {
      console.error('[Email] Error sending template email:', error)
    }
    return false
  }
}

export async function sendBulkTemplateEmails(emails: TemplateEmailOptions[]): Promise<{ success: number; failed: number }> {
  let success = 0
  let failed = 0

  for (const email of emails) {
    const result = await sendTemplateEmail(email)
    if (result) {
      success++
    } else {
      failed++
    }
  }

  return { success, failed }
}
