import type { ConversationAttachment } from '#server/database/conversation-attachments'
import { attachmentService } from '#server/database/conversation-attachments'

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
const DANGEROUS_EXTENSIONS = new Set([
  'ade', 'adp', 'app', 'bat', 'cmd', 'com', 'cpl', 'exe', 'hta', 'ins', 'isp',
  'jar', 'js', 'jse', 'lib', 'lnk', 'mde', 'msc', 'msi', 'msp', 'mst', 'pif',
  'scr', 'sh', 'sct', 'vb', 'vbe', 'vbs', 'vxd', 'wsc', 'wsf', 'wsh'
])

function extensionFor(filename: string) {
  return filename.split('.').pop()?.toLowerCase() || ''
}

export function validateInboxAttachment(filename: string, sizeBytes: number) {
  if (sizeBytes > MAX_ATTACHMENT_BYTES) {
    throw createError({ statusCode: 400, statusMessage: 'Attachments must be 25 MB or smaller' })
  }
  if (DANGEROUS_EXTENSIONS.has(extensionFor(filename))) {
    throw createError({ statusCode: 400, statusMessage: 'This attachment type is not allowed' })
  }
}

export async function storeInboxAttachment(data: {
  messageId: number
  filename: string
  contentType?: string | null
  buffer: Buffer
}): Promise<ConversationAttachment> {
  validateInboxAttachment(data.filename, data.buffer.byteLength)

  if (process.env.VITEST) {
    return attachmentService.create({
      message_id: data.messageId,
      s3_key: `vitest/inbox/${data.messageId}/${data.filename}`,
      filename: data.filename,
      content_type: data.contentType || 'application/octet-stream',
      size_bytes: data.buffer.byteLength
    })
  }

  const uploaded = await uploadToS3(
    data.buffer,
    data.filename,
    data.contentType || 'application/octet-stream'
  )

  return attachmentService.create({
    message_id: data.messageId,
    s3_key: uploaded.key,
    filename: data.filename,
    content_type: data.contentType || 'application/octet-stream',
    size_bytes: data.buffer.byteLength
  })
}

export async function storeRawInboundMime(messageId: number, raw: string | Buffer): Promise<string | null> {
  if (!raw || (typeof raw === 'string' && raw.length === 0)) return null
  const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)

  if (process.env.VITEST) return `vitest/inbox/raw/${messageId}.eml`

  const uploaded = await uploadToS3(buffer, `inbound-${messageId}.eml`, 'message/rfc822')
  return uploaded.key
}

export async function signedAttachmentUrl(key: string | null | undefined): Promise<string | null> {
  if (!key) return null
  if (process.env.VITEST || key.startsWith('vitest/')) return `/__vitest_s3__/${encodeURIComponent(key)}`
  return generateSignedUrl(key)
}

export async function deleteInboxStorageKey(key: string | null | undefined) {
  if (!key || process.env.VITEST || key.startsWith('vitest/')) return
  await deleteFromS3(key)
}
