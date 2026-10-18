import sharp from 'sharp'

// Runs on the web servers, so keep it gentle: one libvips thread and no
// in-memory operation cache, leaving CPU and memory for page requests.
sharp.concurrency(1)
sharp.cache(false)

/**
 * Re-encode images into web-sized copies. IMB featured images routinely
 * arrive as 1–2 MB originals; served as-is they dominate what the mobile app
 * downloads and keeps in its image cache.
 */

const JPEG_QUALITY = 80
const WEBP_QUALITY = 80

export interface CompressedImage {
  data: Buffer
  mimeType: string
}

/**
 * Auto-rotate from EXIF, cap the long side at `maxDimension`, strip metadata
 * (camera EXIF, GPS), and re-encode. Transparent images keep a format with an
 * alpha channel; everything else becomes JPEG. GIFs pass through untouched so
 * animation survives. The original is kept whenever re-encoding would not
 * make it smaller, so already-optimized images never grow.
 */
export async function compressImage(data: Buffer, mimeType: string, maxDimension: number): Promise<CompressedImage> {
  if (mimeType === 'image/gif') return { data, mimeType }

  const image = sharp(data, { failOn: 'none' }).rotate()
  const { width = 0, height = 0, hasAlpha: hasAlphaChannel } = await image.metadata()
  // IMB serves fully opaque RGBA PNGs (named .jpg); only real transparency keeps PNG/WebP.
  const hasAlpha = hasAlphaChannel && !(await image.stats()).isOpaque
  const needsResize = Math.max(width, height) > maxDimension
  if (needsResize) {
    image.resize({ width: maxDimension, height: maxDimension, fit: 'inside', withoutEnlargement: true })
  }

  let output: CompressedImage
  if (hasAlpha && mimeType === 'image/webp') {
    output = { data: await image.webp({ quality: WEBP_QUALITY }).toBuffer(), mimeType: 'image/webp' }
  } else if (hasAlpha) {
    output = { data: await image.png({ compressionLevel: 9, palette: true }).toBuffer(), mimeType: 'image/png' }
  } else {
    output = { data: await image.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer(), mimeType: 'image/jpeg' }
  }

  if (!needsResize && output.data.length >= data.length) return { data, mimeType }
  return output
}
