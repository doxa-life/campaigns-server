/**
 * Sanitize Tiptap JSON content to prevent XSS and ensure valid structure
 *
 * This utility validates and cleans Tiptap/ProseMirror JSON documents by:
 * - Allowing only known, safe node types
 * - Sanitizing text content
 * - Validating URLs in media nodes
 * - Removing unknown attributes
 */

// Allowed node types based on the extensions used in RichTextViewer
const ALLOWED_NODE_TYPES = new Set([
  'doc',
  'paragraph',
  'text',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'taskList',
  'taskItem',
  'blockquote',
  'codeBlock',
  'code',
  'image',
  'horizontalRule',
  'hardBreak',
  'youtube',
  'vimeo',
  'spacer',
  'verse',
  'mention'
])

// Allowed mark types
const ALLOWED_MARK_TYPES = new Set([
  'bold',
  'italic',
  'strike',
  'underline',
  'code',
  'link',
  'textStyle',
  'highlight',
  'subscript',
  'superscript'
])

// Allowed attributes per node type
const ALLOWED_NODE_ATTRS: Record<string, Set<string>> = {
  heading: new Set(['level']),
  image: new Set(['src', 'alt', 'title', 'width', 'height', 'style']),
  youtube: new Set(['src', 'width', 'height', 'start']),
  vimeo: new Set(['src', 'width', 'height']),
  taskItem: new Set(['checked']),
  codeBlock: new Set(['language']),
  spacer: new Set(['height']),
  paragraph: new Set(['textAlign']),
  listItem: new Set([]),
  verse: new Set(['reference', 'translation']),
  mention: new Set(['id', 'label'])
}

// Allowed attributes for marks
const ALLOWED_MARK_ATTRS: Record<string, Set<string>> = {
  link: new Set(['href', 'target', 'rel']),
  textStyle: new Set(['color']),
  highlight: new Set(['color'])
}

// URL protocols that are allowed
const ALLOWED_URL_PROTOCOLS = ['http:', 'https:', 'data:']

// Allowed domains for video embeds
const ALLOWED_VIDEO_DOMAINS = [
  'youtube.com',
  'www.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
  'vimeo.com',
  'player.vimeo.com'
]

/**
 * Validate and sanitize a URL
 */
function sanitizeUrl(url: string, allowedDomains?: string[]): string | null {
  if (!url || typeof url !== 'string') {
    return null
  }

  try {
    // Handle data URLs for images
    if (url.startsWith('data:image/')) {
      // Only allow common image types
      const allowedImageTypes = ['data:image/jpeg', 'data:image/png', 'data:image/gif', 'data:image/webp', 'data:image/svg+xml']
      const isAllowed = allowedImageTypes.some(type => url.startsWith(type))
      return isAllowed ? url : null
    }

    const parsed = new URL(url)

    // Check protocol
    if (!ALLOWED_URL_PROTOCOLS.includes(parsed.protocol)) {
      return null
    }

    // Check domain if specified
    if (allowedDomains && allowedDomains.length > 0) {
      const hostname = parsed.hostname.toLowerCase()
      if (!allowedDomains.some(domain => hostname === domain || hostname.endsWith('.' + domain))) {
        return null
      }
    }

    return url
  } catch {
    return null
  }
}

/**
 * Sanitize text content by removing potentially dangerous characters/patterns
 */
function sanitizeText(text: string): string {
  if (typeof text !== 'string') {
    return ''
  }

  // Remove null bytes
  let sanitized = text.replace(/\0/g, '')

  // Remove control characters except common whitespace
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')

  return sanitized
}

/**
 * Sanitize node attributes based on allowed list
 */
function sanitizeAttrs(
  nodeType: string,
  attrs: Record<string, any> | undefined
): Record<string, any> | undefined {
  if (!attrs || typeof attrs !== 'object') {
    return undefined
  }

  const allowedAttrs = ALLOWED_NODE_ATTRS[nodeType]
  if (!allowedAttrs) {
    return undefined
  }

  const sanitized: Record<string, any> = {}

  for (const [key, value] of Object.entries(attrs)) {
    if (!allowedAttrs.has(key)) {
      continue
    }

    // Special handling for specific attributes
    if (key === 'src') {
      // Validate URLs for images and videos
      const allowedDomains = nodeType === 'youtube' || nodeType === 'vimeo'
        ? ALLOWED_VIDEO_DOMAINS
        : undefined
      const sanitizedUrl = sanitizeUrl(String(value), allowedDomains)
      if (sanitizedUrl) {
        sanitized[key] = sanitizedUrl
      }
    } else if (key === 'href') {
      const sanitizedUrl = sanitizeUrl(String(value))
      if (sanitizedUrl) {
        sanitized[key] = sanitizedUrl
      }
    } else if (key === 'level') {
      // Heading levels must be 1-6
      const level = parseInt(value, 10)
      if (level >= 1 && level <= 6) {
        sanitized[key] = level
      }
    } else if (key === 'checked') {
      sanitized[key] = Boolean(value)
    } else if (key === 'width' || key === 'height' || key === 'start') {
      // Numeric values
      const num = parseInt(value, 10)
      if (!isNaN(num) && num >= 0) {
        sanitized[key] = num
      }
    } else if (key === 'textAlign') {
      // Only allow valid text alignments
      const validAlignments = ['left', 'center', 'right', 'justify']
      if (validAlignments.includes(String(value))) {
        sanitized[key] = value
      }
    } else if (key === 'color') {
      // Validate color values (hex, rgb, named colors)
      const colorValue = String(value)
      if (/^#[0-9A-Fa-f]{3,8}$/.test(colorValue) ||
          /^rgb\(\d{1,3},\s*\d{1,3},\s*\d{1,3}\)$/.test(colorValue) ||
          /^[a-zA-Z]+$/.test(colorValue)) {
        sanitized[key] = colorValue
      }
    } else if (key === 'reference') {
      // Bible reference string, max 100 chars, alphanumeric + spaces, colons, dashes
      const refValue = String(value).trim()
      if (refValue.length > 0 && refValue.length <= 100 && /^[\w\p{L}\s:,\-–—.]+$/u.test(refValue)) {
        sanitized[key] = refValue
      }
    } else if (key === 'translation') {
      const val = String(value).trim()
      if (val.length > 0 && val.length <= 20 && /^[\w\p{L}\d\s]+$/u.test(val)) {
        sanitized[key] = val
      }
    } else if (key === 'style') {
      // For image style, only allow specific style properties
      const styleValue = String(value)
      // Only allow float and margin styles for images
      const safeStylePattern = /^(float:\s*(left|right|none)|margin:\s*[\d.]+[a-z%]*(\s+[\d.]+[a-z%]*){0,3})(;\s*(float:\s*(left|right|none)|margin:\s*[\d.]+[a-z%]*(\s+[\d.]+[a-z%]*){0,3}))*;?$/i
      if (safeStylePattern.test(styleValue) || styleValue === '') {
        sanitized[key] = styleValue
      }
    } else if (typeof value === 'string') {
      sanitized[key] = sanitizeText(value)
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      sanitized[key] = value
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined
}

/**
 * Sanitize mark attributes
 */
function sanitizeMarkAttrs(
  markType: string,
  attrs: Record<string, any> | undefined
): Record<string, any> | undefined {
  if (!attrs || typeof attrs !== 'object') {
    return undefined
  }

  const allowedAttrs = ALLOWED_MARK_ATTRS[markType]
  if (!allowedAttrs) {
    return undefined
  }

  const sanitized: Record<string, any> = {}

  for (const [key, value] of Object.entries(attrs)) {
    if (!allowedAttrs.has(key)) {
      continue
    }

    if (key === 'href') {
      const sanitizedUrl = sanitizeUrl(String(value))
      if (sanitizedUrl) {
        sanitized[key] = sanitizedUrl
      }
    } else if (key === 'target') {
      // Only allow _blank target
      if (value === '_blank') {
        sanitized[key] = value
      }
    } else if (key === 'rel') {
      // Only allow safe rel values
      const safeRels = ['noopener', 'noreferrer', 'nofollow']
      const relValue = String(value).toLowerCase()
      const rels = relValue.split(/\s+/).filter(r => safeRels.includes(r))
      if (rels.length > 0) {
        sanitized[key] = rels.join(' ')
      }
    } else if (key === 'color') {
      const colorValue = String(value)
      if (/^#[0-9A-Fa-f]{3,8}$/.test(colorValue) ||
          /^rgb\(\d{1,3},\s*\d{1,3},\s*\d{1,3}\)$/.test(colorValue) ||
          /^[a-zA-Z]+$/.test(colorValue)) {
        sanitized[key] = colorValue
      }
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined
}

/**
 * Sanitize marks array
 */
function sanitizeMarks(marks: any[] | undefined): any[] | undefined {
  if (!Array.isArray(marks)) {
    return undefined
  }

  const sanitized = marks
    .filter(mark => mark && typeof mark === 'object' && ALLOWED_MARK_TYPES.has(mark.type))
    .map(mark => {
      const sanitizedMark: any = { type: mark.type }
      const attrs = sanitizeMarkAttrs(mark.type, mark.attrs)
      if (attrs) {
        sanitizedMark.attrs = attrs
      }
      return sanitizedMark
    })

  return sanitized.length > 0 ? sanitized : undefined
}

/**
 * Recursively sanitize a Tiptap node
 */
function sanitizeNode(node: any): any | null {
  if (!node || typeof node !== 'object') {
    return null
  }

  // Check if node type is allowed
  if (!ALLOWED_NODE_TYPES.has(node.type)) {
    return null
  }

  const sanitized: any = {
    type: node.type
  }

  // Sanitize text content
  if (node.type === 'text' && typeof node.text === 'string') {
    sanitized.text = sanitizeText(node.text)
    const marks = sanitizeMarks(node.marks)
    if (marks) {
      sanitized.marks = marks
    }
    return sanitized
  }

  // Sanitize attributes
  const attrs = sanitizeAttrs(node.type, node.attrs)
  if (attrs) {
    sanitized.attrs = attrs
  }

  // Recursively sanitize content (child nodes)
  if (Array.isArray(node.content)) {
    const sanitizedContent = node.content
      .map((child: any) => sanitizeNode(child))
      .filter((child: any) => child !== null)

    if (sanitizedContent.length > 0) {
      sanitized.content = sanitizedContent
    }
  }

  // Sanitize marks on non-text nodes (some nodes can have marks)
  if (node.marks) {
    const marks = sanitizeMarks(node.marks)
    if (marks) {
      sanitized.marks = marks
    }
  }

  return sanitized
}

/**
 * Sanitize a Tiptap JSON document
 *
 * @param content - The Tiptap JSON content to sanitize
 * @returns Sanitized Tiptap JSON content, or null if invalid
 */
export function sanitizeTiptapContent(content: Record<string, any> | null): Record<string, any> | null {
  if (!content) {
    return null
  }

  // Must be a doc node at root
  if (content.type !== 'doc') {
    return null
  }

  return sanitizeNode(content)
}

/**
 * Sanitize an array of content items (for bulk import)
 *
 * @param items - Array of content items to sanitize
 * @returns Sanitized array of content items
 */
export function sanitizeImportContent(
  items: Array<{
    day_number: number
    language_code: string
    content_json: Record<string, any> | null
  }>
): Array<{
  day_number: number
  language_code: string
  content_json: Record<string, any> | null
}> {
  return items.map(item => ({
    ...item,
    content_json: sanitizeTiptapContent(item.content_json)
  }))
}
