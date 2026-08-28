import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { randomBytes } from 'crypto'
import { createError } from 'h3'
import { sniffImageMime } from './public-image-storage'

/**
 * Storage for pictures attached to public /updates suggestions. Uploaded by
 * unauthenticated visitors, so they go to the PRIVATE bucket and are only
 * viewable through the authenticated admin proxy; when a suggestion is
 * applied, the image is copied to the public images bucket.
 */

const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

const SUGGESTION_PREFIX = 'pg-suggestions/'

function getPrivateConfig() {
  return {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    region: process.env.S3_REGION || 'us-west-004',
    bucket: process.env.S3_BUCKET_NAME,
    endpoint: process.env.S3_ENDPOINT,
  }
}

function buildClient(cfg: ReturnType<typeof getPrivateConfig>): S3Client {
  const clientConfig: any = {
    region: cfg.region,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  }
  if (cfg.endpoint) {
    const cleanEndpoint = cfg.endpoint.replace(/^https?:\/\//, '')
    clientConfig.endpoint = `https://${cleanEndpoint}`
    clientConfig.forcePathStyle = true
  }
  return new S3Client(clientConfig)
}

/**
 * Guard for the admin preview proxy: only keys under the suggestion prefix,
 * never path traversal — otherwise the proxy would be a read-any-key oracle
 * into the private bucket.
 */
export function isSuggestionImageKey(key: string): boolean {
  return key.startsWith(SUGGESTION_PREFIX) && !key.includes('..')
}

/** Validate (magic-byte sniff + size cap) and upload to the private bucket. */
export async function uploadSuggestionImage(data: Buffer): Promise<{ key: string }> {
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

  const cfg = getPrivateConfig()
  if (!cfg.accessKeyId || !cfg.secretAccessKey || !cfg.bucket) {
    throw createError({ statusCode: 500, statusMessage: 'Private image storage is not configured (S3_BUCKET_NAME).' })
  }

  const client = buildClient(cfg)
  const key = `${SUGGESTION_PREFIX}${randomBytes(16).toString('hex')}.${EXT_BY_MIME[mimeType]}`
  await client.send(new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: key,
    Body: data,
    ContentType: mimeType,
  }))

  return { key }
}

/** Fetch the raw bytes of a suggestion image, or null if missing/unconfigured. */
export async function getSuggestionImageObject(key: string): Promise<{ data: Buffer; contentType: string } | null> {
  const cfg = getPrivateConfig()
  if (!cfg.accessKeyId || !cfg.secretAccessKey || !cfg.bucket) return null

  const client = buildClient(cfg)
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }))
    if (!res.Body) return null
    const stream = res.Body as NodeJS.ReadableStream
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk as Uint8Array))
    }
    return { data: Buffer.concat(chunks), contentType: res.ContentType || 'application/octet-stream' }
  } catch {
    return null
  }
}
