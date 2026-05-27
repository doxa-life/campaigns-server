export interface PageCursor {
  c: string
  i: number
}

function toBase64Url(s: string): string {
  return Buffer.from(s, 'utf-8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): string {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  return Buffer.from(padded + pad, 'base64').toString('utf-8')
}

export function encodeCursor(cursor: PageCursor): string {
  return toBase64Url(JSON.stringify(cursor))
}

export function decodeCursor(encoded: string | null | undefined): PageCursor | null {
  if (!encoded) return null
  try {
    const parsed = JSON.parse(fromBase64Url(encoded))
    if (typeof parsed?.c === 'string' && typeof parsed?.i === 'number') {
      return { c: parsed.c, i: parsed.i }
    }
    return null
  } catch {
    return null
  }
}
