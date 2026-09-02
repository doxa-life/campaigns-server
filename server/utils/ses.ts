/**
 * Shared AWS SES (v2 API) transport used by all three send paths — base
 * transactional (email.ts), inbox (inbox-email.ts), and marketing
 * (marketing-email-sender.ts). nodemailer builds the raw MIME (headers,
 * threading, CID attachments) and hands it to SES SendEmail as raw content.
 *
 * Configuration sets separate the transactional and marketing streams so
 * bounce/complaint/delivery events publish to SNS per stream; pass the set
 * name per message via sendMail's `ses: { ConfigurationSetName }` option.
 */
import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'

export function getSesConfig() {
  let config: Record<string, any> = {}
  try {
    config = useRuntimeConfig()
  } catch {
    // Outside the Nitro context (scripts) fall through to process.env
  }
  return {
    region: config.awsRegion || process.env.AWS_REGION || process.env.AWS_SES_REGION || '',
    accessKeyId: config.awsAccessKeyId || process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: config.awsSecretAccessKey || process.env.AWS_SECRET_ACCESS_KEY || '',
    // Optional: when unset, sends carry no configuration set (no event publishing)
    transactionalConfigSet: config.sesTransactionalConfigSet || process.env.SES_TRANSACTIONAL_CONFIGURATION_SET || '',
    marketingConfigSet: config.sesMarketingConfigSet || process.env.SES_MARKETING_CONFIGURATION_SET || '',
  }
}

export function isSesConfigured(): boolean {
  const { region, accessKeyId, secretAccessKey } = getSesConfig()
  return Boolean(region && accessKeyId && secretAccessKey)
}

let sesTransporter: Transporter | null = null

export function getSesTransporter(): Transporter {
  if (sesTransporter) return sesTransporter

  const { region, accessKeyId, secretAccessKey } = getSesConfig()
  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error('AWS SES configuration incomplete. Set AWS_SES_REGION (or AWS_REGION), AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY.')
  }

  const sesClient = new SESv2Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
    // Bound each request so a hung connection fails fast instead of stalling a
    // serial send batch long enough for the stale-job reaper to reclaim live jobs.
    requestHandler: { connectionTimeout: 5000, requestTimeout: 30000 },
  })

  sesTransporter = nodemailer.createTransport({
    SES: { sesClient, SendEmailCommand },
  } as any)
  return sesTransporter
}

/**
 * Per-message SES params for sendMail: attaches the configuration set for the
 * given stream when one is configured. Spread into the sendMail options.
 */
export function sesMessageOptions(stream: 'transactional' | 'marketing'): { ses?: { ConfigurationSetName: string } } {
  const config = getSesConfig()
  const configSet = stream === 'marketing' ? config.marketingConfigSet : config.transactionalConfigSet
  return configSet ? { ses: { ConfigurationSetName: configSet } } : {}
}
