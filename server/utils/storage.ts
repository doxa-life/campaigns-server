import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomBytes } from 'crypto'

// S3 Client instance (will be initialized lazily)
let s3Client: S3Client | null = null

const SIGNED_URL_EXPIRATION = 60 * 60 * 24 * 7 // 7 days in seconds

// Get S3 settings from environment variables
function getS3Settings() {
  // Try to get runtime config first (for production builds), then fallback to process.env
  let S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET_NAME

  try {
    // Use runtime config if available (production build)
    const config = useRuntimeConfig()
    S3_ENDPOINT = config.s3Endpoint || process.env.S3_ENDPOINT
    S3_REGION = config.s3Region || process.env.S3_REGION
    S3_ACCESS_KEY_ID = config.s3AccessKeyId || process.env.S3_ACCESS_KEY_ID
    S3_SECRET_ACCESS_KEY = config.s3SecretAccessKey || process.env.S3_SECRET_ACCESS_KEY
    S3_BUCKET_NAME = config.s3BucketName || process.env.S3_BUCKET_NAME
  } catch {
    // Fallback to process.env (development mode)
    S3_ENDPOINT = process.env.S3_ENDPOINT
    S3_REGION = process.env.S3_REGION
    S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID
    S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY
    S3_BUCKET_NAME = process.env.S3_BUCKET_NAME
  }

  return {
    endpoint: S3_ENDPOINT,
    region: S3_REGION || 'us-west-004',
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
    bucketName: S3_BUCKET_NAME
  }
}

// Initialize S3 client with current settings
function initializeS3Client() {
  const settings = getS3Settings()

  if (!settings.endpoint || !settings.accessKeyId || !settings.secretAccessKey || !settings.bucketName) {
    throw new Error('S3 configuration is incomplete. Please set S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, and S3_BUCKET_NAME environment variables.')
  }

  s3Client = new S3Client({
    endpoint: settings.endpoint,
    region: settings.region,
    credentials: {
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
    },
    forcePathStyle: true, // Required for B2
  })

  return s3Client
}

// Get S3 client (initialize if needed)
function getS3Client() {
  if (!s3Client) {
    return initializeS3Client()
  }
  return s3Client
}

export interface UploadResult {
  url: string
  key: string
  filename: string
}

/**
 * Upload a file to S3-compatible storage (Backblaze B2)
 */
export async function uploadToS3(
  fileData: Buffer,
  originalFilename: string,
  contentType: string
): Promise<UploadResult> {
  try {
    const client = getS3Client()
    const settings = getS3Settings()

    // Generate unique filename
    const ext = originalFilename.split('.').pop()
    const randomName = randomBytes(16).toString('hex')
    const key = `uploads/${randomName}.${ext}`

    // Upload to S3
    const command = new PutObjectCommand({
      Bucket: settings.bucketName,
      Key: key,
      Body: fileData,
      ContentType: contentType,
    })

    await client.send(command)

    // Generate signed URL for private bucket access
    const url = await generateSignedUrl(key)

    return {
      url,
      key,
      filename: originalFilename,
    }
  } catch (error: any) {
    console.error('S3 upload error:', error)
    throw new Error(`Failed to upload file to storage: ${error.message}`)
  }
}

/**
 * Delete a file from S3-compatible storage
 */
export async function deleteFromS3(key: string): Promise<void> {
  try {
    const client = getS3Client()
    const settings = getS3Settings()

    const command = new DeleteObjectCommand({
      Bucket: settings.bucketName,
      Key: key,
    })

    await client.send(command)
  } catch (error: any) {
    console.error('S3 delete error:', error)
    throw new Error(`Failed to delete file from storage: ${error.message}`)
  }
}

/**
 * Generate a signed URL for accessing a file in private bucket
 */
export async function generateSignedUrl(key: string, expiresIn: number = SIGNED_URL_EXPIRATION): Promise<string> {
  try {
    const client = getS3Client()
    const settings = getS3Settings()

    const command = new GetObjectCommand({
      Bucket: settings.bucketName,
      Key: key,
    })

    const url = await getSignedUrl(client, command, { expiresIn })
    return url
  } catch (error: any) {
    console.error('S3 signed URL generation error:', error)
    throw new Error(`Failed to generate signed URL: ${error.message}`)
  }
}

/**
 * Validate file type for image uploads
 */
export function validateImageType(contentType: string): boolean {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif']
  return allowedTypes.includes(contentType)
}

/**
 * Validate file size
 */
export function validateFileSize(fileSize: number, maxSizeMB: number = 5): boolean {
  const maxSize = maxSizeMB * 1024 * 1024
  return fileSize <= maxSize
}
