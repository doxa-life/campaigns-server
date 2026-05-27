import { sanitizeEmailHtml } from './inbox-sanitize-html'

/**
 * Quoted-history builders shared by both outbound send paths:
 * - the queued outbound processor (replies composed in /admin/inbox)
 * - the inbound webhook staff branch (reply-by-email)
 *
 * Gmail-style: newest message on top, each prior message as an attributed
 * blockquote. Inbound HTML is sanitized before being quoted into the outbound
 * email since it can include untrusted markup.
 */

type QuoteCandidate = {
  direction: string
  sender_name?: string | null
  from_name: string | null
  from_email: string | null
  body_html: string | null
  body_stripped_html: string | null
  body_text: string | null
  created_at: string | Date
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function quoteAuthor(m: QuoteCandidate): string {
  if (m.direction === 'outbound') return m.sender_name || m.from_name || 'Doxa Prayer'
  return m.from_name || m.from_email || 'Contact'
}

export function buildQuotedHtml(messages: QuoteCandidate[]): string {
  if (messages.length === 0) return ''
  let out = '<br><br>'
  for (const m of [...messages].reverse()) {
    const when = new Date(m.created_at).toUTCString()
    const body = sanitizeEmailHtml(m.body_stripped_html || m.body_html || (m.body_text || '').replace(/\n/g, '<br>'))
    out += `<blockquote style="margin:0 0 0 0.8ex;border-left:2px solid #ccc;padding-left:1ex;color:#555;">`
    out += `<div style="font-size:12px;color:#888;margin-bottom:4px;">On ${escapeHtml(when)}, ${escapeHtml(quoteAuthor(m))} wrote:</div>`
    out += body
    out += `</blockquote>`
  }
  return out
}

export function buildQuotedText(messages: QuoteCandidate[]): string {
  if (messages.length === 0) return ''
  let out = '\n\n'
  for (const m of [...messages].reverse()) {
    const when = new Date(m.created_at).toUTCString()
    const body = m.body_text || (m.body_stripped_html || m.body_html || '').replace(/<[^>]*>/g, '')
    const quoted = body.split('\n').map((l: string) => '> ' + l).join('\n')
    out += `On ${when}, ${quoteAuthor(m)} wrote:\n${quoted}\n\n`
  }
  return out
}
