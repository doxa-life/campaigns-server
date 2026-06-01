import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { randomBytes } from 'crypto'
import { createError } from 'h3'

/**
 * Upload helper for the PUBLIC images bucket (library prayer content +
 * inbox email replies). This is deliberately separate from the base
 * layer's `uploadToS3`, which targets the PRIVATE bucket (signed URLs,
 * inbox attachments). Objects written here are served directly through
 * S3_PUBLIC_BASE_URL with a stable, non-expiring URL safe to embed in
 * long-lived content and in outbound email HTML.
 */

const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

/**
 * Sniff the image MIME type from magic bytes. The browser-declared
 * Content-Type is never trusted here because these objects become
 * publicly fetchable — a non-image masquerading as an image must be
 * rejected. Recognises JPEG, PNG, GIF, and WebP.
 */
export function sniffImageMime(buf: Buffer): string | null {
  if (buf.length < 12) return null
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
    && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return 'image/png'
  // GIF: 'GIF87a' or 'GIF89a'
  if (
    buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38
    && (buf[4] === 0x37 || buf[4] === 0x39) && buf[5] === 0x61
  ) return 'image/gif'
  // WebP: 'RIFF' .... 'WEBP'
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
    && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return 'image/webp'
  return null
}

function getPublicConfig() {
  // The public bucket can live on a different provider than the private
  // bucket (e.g. private on Backblaze B2, public on Cloudflare R2). The
  // S3_PUBLIC_* endpoint/credentials override the main S3_* ones; when a
  // value is blank it falls back to the main config (same-provider setups).
  return {
    accessKeyId: process.env.S3_PUBLIC_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_PUBLIC_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY,
    region: process.env.S3_PUBLIC_REGION || process.env.S3_REGION || 'auto',
    bucket: process.env.S3_PUBLIC_BUCKET,
    endpoint: process.env.S3_PUBLIC_ENDPOINT || process.env.S3_ENDPOINT,
    baseUrl: process.env.S3_PUBLIC_BASE_URL,
  }
}

/** Build a stable, public URL for an object key using S3_PUBLIC_BASE_URL. */
function getPublicImageUrl(key: string): string {
  const { baseUrl } = getPublicConfig()
  if (!baseUrl) {
    throw createError({ statusCode: 500, statusMessage: 'S3_PUBLIC_BASE_URL is not configured' })
  }
  return `${baseUrl.replace(/\/$/, '')}/${key}`
}

export interface PublicImageUploadResult {
  url: string
  key: string
  mimeType: string
  byteSize: number
}

/**
 * Validate (magic-byte sniff + size cap) and upload an image to the
 * public images bucket. Returns a stable CDN URL safe to embed in
 * library content and outbound email HTML.
 */
export async function uploadPublicImage(data: Buffer): Promise<PublicImageUploadResult> {
  if (!data || data.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Image bytes are required' })
  }
  if (data.length > MAX_IMAGE_BYTES) {
    throw createError({ statusCode: 413, statusMessage: `Image exceeds ${MAX_IMAGE_BYTES / (1024 * 1024)}MB limit` })
  }

  const mimeType = sniffImageMime(data)
  if (!mimeType) {
    throw createError({ statusCode: 415, statusMessage: 'Unsupported image type — only JPEG, PNG, GIF, and WebP are accepted' })
  }

  const { accessKeyId, secretAccessKey, region, bucket, endpoint, baseUrl } = getPublicConfig()
  if (!accessKeyId || !secretAccessKey || !bucket || !baseUrl) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Public image storage is not configured. Set S3_PUBLIC_BUCKET and S3_PUBLIC_BASE_URL.',
    })
  }

  const s3ClientConfig: any = {
    region,
    credentials: { accessKeyId, secretAccessKey },
  }
  if (endpoint) {
    const cleanEndpoint = endpoint.replace(/^https?:\/\//, '')
    s3ClientConfig.endpoint = `https://${cleanEndpoint}`
    s3ClientConfig.forcePathStyle = true
  }
  const s3Client = new S3Client(s3ClientConfig)

  // No per-object ACL: public exposure is configured at the bucket level
  // (B2 public bucket) or via a connected public domain (R2 custom domain).
  // R2 ignores ACLs entirely, so setting one here would be misleading.
  const key = `uploads/images/${randomBytes(16).toString('hex')}.${EXT_BY_MIME[mimeType]}`
  await s3Client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: data,
    ContentType: mimeType,
  }))

  return { url: getPublicImageUrl(key), key, mimeType, byteSize: data.length }
}
