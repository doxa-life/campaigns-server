import { parseAuthentication, type InboundHeaders } from './mailgun-inbound'

/**
 * Helpers for SendGrid Inbound Parse payloads (raw MIME mode). The parse POST
 * carries the full raw email in the `email` field plus SendGrid's own SPF/DKIM
 * validation results as form fields; MIME parsing itself happens in the webhook
 * via mailparser.
 */

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

function domainOf(email: string | null | undefined): string | null {
  if (!email) return null
  const at = email.lastIndexOf('@')
  return at === -1 ? null : email.slice(at + 1).toLowerCase()
}

function domainsAlign(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  if (a === b) return true
  // Relaxed alignment: organizational-domain match either direction
  return a.endsWith('.' + b) || b.endsWith('.' + a)
}

/**
 * Inbound authentication for SendGrid mail. Inbound Parse validates SPF and
 * DKIM itself and posts the results as form fields (`SPF`: pass/fail;
 * `dkim`: e.g. `{@gmail.com : pass}`); there is no DMARC verdict, so DMARC is
 * approximated the way it evaluates: a passing DKIM signature aligned with the
 * From domain, or a passing SPF whose envelope-from aligns with the From
 * domain. An upstream Authentication-Results header, when present, also counts
 * via the shared parser.
 */
export function parseSendgridAuthentication(
  fields: { dkim?: string | null; spf?: string | null; envelopeFrom?: string | null },
  headers: InboundHeaders,
  fromEmail: string | null
): { authenticated: boolean; authResult: string | null } {
  const headerAuth = parseAuthentication(headers, fromEmail)
  const fromDomain = domainOf(fromEmail)

  const dkimRaw = fields.dkim || ''
  let dkimAligned = false
  for (const match of dkimRaw.matchAll(/@([a-z0-9._-]+)\s*:\s*pass/gi)) {
    if (domainsAlign(match[1]!.toLowerCase(), fromDomain)) {
      dkimAligned = true
      break
    }
  }

  const spfPass = (fields.spf || '').trim().toLowerCase() === 'pass'
  const spfAligned = spfPass && domainsAlign(domainOf(fields.envelopeFrom), fromDomain)

  const authResult =
    headerAuth.authResult || `sendgrid: spf=${fields.spf || 'none'}; dkim=${dkimRaw || 'none'}`
  return { authenticated: dkimAligned || spfAligned || headerAuth.authenticated, authResult }
}
