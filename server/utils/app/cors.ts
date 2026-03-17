import { type H3Event, setResponseHeader } from 'h3'

/**
 * Set cache headers for public API endpoints
 * Default: 5 minutes for both browser and CDN
 */
export function setCacheHeaders(event: H3Event, options?: {
  maxAge?: number
  sMaxAge?: number
}) {
  const maxAge = options?.maxAge ?? 300
  const sMaxAge = options?.sMaxAge ?? 300
  setResponseHeader(event, 'Cache-Control', `public, max-age=${maxAge}, s-maxage=${sMaxAge}`)
}
