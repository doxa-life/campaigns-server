import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSesConfig } from './ses'
import { parseAuthentication, type InboundHeaders } from './mailgun-inbound'

/**
 * Helpers for SES inbound receiving. A receipt rule stores the raw MIME in S3
 * and publishes an SNS notification (notificationType "Received") carrying the
 * receipt verdicts and the S3 location — or, for small messages delivered via
 * an SNS-only action, the base64 content inline.
 */

export interface SesReceiptVerdict {
  status?: string // PASS | FAIL | GRAY | PROCESSING_FAILED | DISABLED
}

export interface SesInboundNotification {
  notificationType?: string // 'Received'
  receipt?: {
    recipients?: string[]
    spamVerdict?: SesReceiptVerdict
    virusVerdict?: SesReceiptVerdict
    spfVerdict?: SesReceiptVerdict
    dkimVerdict?: SesReceiptVerdict
    dmarcVerdict?: SesReceiptVerdict
    action?: {
      type?: string // 'S3' | 'SNS' | ...
      bucketName?: string
      objectKey?: string
      encoding?: string // SNS action: 'UTF8' | 'BASE64'
    }
  }
  mail?: {
    messageId?: string
    source?: string
  }
  content?: string // SNS-only action: the raw email inline
}

// Dedicated client for the inbound mail bucket — this is real AWS S3 (SES can only
// deliver there), separate from the app's DigitalOcean Spaces storage client.
let inboundS3Client: S3Client | null = null

function getInboundS3Client(): S3Client {
  if (inboundS3Client) return inboundS3Client
  const { region, accessKeyId, secretAccessKey } = getSesConfig()
  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error('AWS SES configuration incomplete for inbound S3 fetch.')
  }
  inboundS3Client = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
    requestHandler: { connectionTimeout: 5000, requestTimeout: 30000 },
  })
  return inboundS3Client
}

/**
 * Fetch the raw MIME for a Received notification: inline content when the
 * receipt used an SNS-only action, otherwise the S3 object the rule stored.
 */
export async function fetchSesInboundRaw(notification: SesInboundNotification): Promise<Buffer | null> {
  if (notification.content) {
    const encoding = (notification.receipt?.action?.encoding || 'BASE64').toUpperCase()
    return Buffer.from(notification.content, encoding === 'UTF8' ? 'utf-8' : 'base64')
  }

  const action = notification.receipt?.action
  if (action?.type === 'S3' && action.bucketName && action.objectKey) {
    const res = await getInboundS3Client().send(
      new GetObjectCommand({ Bucket: action.bucketName, Key: action.objectKey })
    )
    if (!res.Body) return null
    return Buffer.from(await res.Body.transformToByteArray())
  }

  return null
}

/** Build an InboundHeaders view over mailparser's raw headerLines (folded lines unfolded). */
export function headersFromHeaderLines(headerLines: readonly { key: string; line: string }[]): InboundHeaders {
  const map = new Map<string, string[]>()
  for (const { key, line } of headerLines) {
    const idx = line.indexOf(':')
    const value = (idx === -1 ? line : line.slice(idx + 1)).replace(/\r?\n\s+/g, ' ').trim()
    const k = key.toLowerCase()
    const existing = map.get(k) || []
    existing.push(value)
    map.set(k, existing)
  }
  return {
    get: (name: string) => map.get(name.toLowerCase())?.[0] ?? null,
    getAll: (name: string) => map.get(name.toLowerCase()) ?? [],
  }
}

/**
 * Inbound authentication for SES mail. The receipt's DMARC verdict is
 * authoritative; the Authentication-Results header SES writes into the stored
 * message covers the DKIM-alignment fallback via the shared parser.
 */
export function parseSesAuthentication(
  receipt: SesInboundNotification['receipt'],
  headers: InboundHeaders,
  fromEmail: string | null
): { authenticated: boolean; authResult: string | null } {
  const headerAuth = parseAuthentication(headers, fromEmail)
  const dmarcPass = (receipt?.dmarcVerdict?.status || '').toUpperCase() === 'PASS'
  const authResult =
    headerAuth.authResult ||
    `ses verdicts: spf=${receipt?.spfVerdict?.status || 'NONE'}; dkim=${receipt?.dkimVerdict?.status || 'NONE'}; dmarc=${receipt?.dmarcVerdict?.status || 'NONE'}`
  return { authenticated: dmarcPass || headerAuth.authenticated, authResult }
}
