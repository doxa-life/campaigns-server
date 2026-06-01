import DOMPurify from 'dompurify'

/**
 * Sanitize untrusted message HTML before it is rendered via `v-html` in the
 * inbox thread. Inbound message bodies come from external email senders (and
 * forwarded staff/agent HTML), so they must never reach the DOM unsanitized —
 * an unsanitized `<img onerror>` would be stored XSS executing in the admin
 * origin. DOMPurify strips scripts, event handlers, and javascript: URLs while
 * keeping the formatting an email body needs.
 */
export function sanitizeMessageHtml(html: string): string {
  if (!html) return ''
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['style'],
  })
}
