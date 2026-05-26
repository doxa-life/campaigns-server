/**
 * Shared HTML shells for inbox-originated email.
 *
 * Two looks, deliberately distinct:
 * - renderInboxMessageEmail: a LIGHT, personal shell for contact-facing mail
 *   (auto-ack, the human reply, held-sender notice). It only supplies the brand
 *   font, text color, and a width cap — no logo banner / colored bar / "automated"
 *   footer, because those would make a person's reply look impersonal and false.
 * - renderAdminNotificationEmail: the minimal admin-notification shell used by the
 *   existing app templates (e.g. contact-notification-email.ts), for staff alerts.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Light shell for contact-facing inbox messages. `bodyHtml` is inserted as-is. */
export function renderInboxMessageEmail(opts: {
  bodyHtml: string
  locale?: string
  subject?: string
}): string {
  const locale = opts.locale || 'en'
  const title = opts.subject ? escapeHtml(opts.subject) : ''
  return `
    <!DOCTYPE html>
    <html lang="${locale}">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #3B463D; max-width: 600px; margin: 0 auto; padding: 20px; font-size: 16px;">
      ${opts.bodyHtml}
    </body>
    </html>
  `
}

/** Minimal admin-notification shell, matching the existing legacy app templates. */
export function renderAdminNotificationEmail(opts: {
  heading: string
  contentHtml: string
  appName: string
  footerNote?: string
}): string {
  const footer = opts.footerNote || `This is an automated notification from ${escapeHtml(opts.appName)}.`
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><title>${escapeHtml(opts.heading)}</title></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #3B463D; margin-bottom: 20px;">${escapeHtml(opts.heading)}</h2>
      ${opts.contentHtml}
      <div style="text-align: center; margin-top: 20px; padding: 15px; color: #999; font-size: 12px;">
        ${footer}
      </div>
    </body>
    </html>
  `
}
