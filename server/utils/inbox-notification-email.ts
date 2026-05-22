import { notificationRecipientService } from '../database/notification-recipients'
import { userService } from '../database/users'
import { roleService } from '../database/roles'
import type { Conversation } from '../database/conversations'
import type { ConversationMessage } from '../database/conversation-messages'
import { inboxEmailService } from './inbox-email'
import { buildContactReplyAddress, buildSignedReplyAddress } from './inbox-addressing'
import { sanitizeEmailHtml } from './inbox-sanitize-html'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getConfig() {
  const config = useRuntimeConfig()
  return {
    siteUrl: config.public.siteUrl || 'http://localhost:3000',
    appName: config.appName || 'DOXA Prayer',
    contactAddress: config.inboxContactAddress || 'contact@doxa.life',
    replySecret: config.inboxReplySecret || config.jwtSecret || '',
  }
}

// Build a Reply-To for a staff recipient: signed (authenticates reply-by-email) when the
// recipient is a user with inbox.send; otherwise the plain contact reply address (their
// reply would land as an unknown sender and be held — by design).
async function replyToFor(recipientEmail: string, conversation: Conversation, cfg: ReturnType<typeof getConfig>): Promise<string> {
  const user = await userService.getUserByEmail(recipientEmail)
  if (user) {
    const canSend = await roleService.userHasPermission(user.id, 'inbox.send')
    if (canSend && cfg.replySecret) {
      return buildSignedReplyAddress({
        token: conversation.reply_token,
        userId: user.id,
        conversationId: conversation.id,
        secret: cfg.replySecret,
        contactAddress: cfg.contactAddress,
      })
    }
  }
  return buildContactReplyAddress(conversation.reply_token, cfg.contactAddress)
}

function renderNotification(opts: {
  appName: string
  contactName: string
  contactEmail: string
  bodyHtml: string
  conversationUrl: string
  held: boolean
}): { html: string; text: string } {
  const heading = opts.held ? 'A message needs review' : 'New inbox message'
  const note = opts.held
    ? '<p style="color:#a15c00;">This message could not be matched to a sender automatically. Please log in to review and decide what should happen.</p>'
    : ''

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><title>${escapeHtml(heading)}</title></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #3B463D;">${escapeHtml(heading)}</h2>
      ${note}
      <p style="margin:4px 0;"><strong>From:</strong> ${escapeHtml(opts.contactName)} &lt;${escapeHtml(opts.contactEmail)}&gt;</p>
      <div style="border:1px solid #eee; border-radius:6px; padding:16px; margin:16px 0;">${sanitizeEmailHtml(opts.bodyHtml)}</div>
      <p style="font-size:14px; color:#666;">Reply directly to this email to respond from your Doxa address, or <a href="${opts.conversationUrl}" style="color:#3B463D;">open the conversation</a>.</p>
      <div style="text-align:center; margin-top:20px; padding:15px; color:#999; font-size:12px;">This is an automated notification from ${escapeHtml(opts.appName)}.</div>
    </body>
    </html>
  `
  const text = [
    heading,
    opts.held ? '\nThis message could not be matched to a sender automatically. Log in to review.' : '',
    `\nFrom: ${opts.contactName} <${opts.contactEmail}>`,
    `\nOpen the conversation: ${opts.conversationUrl}`,
  ].join('\n')
  return { html, text }
}

/** Notify the configured contact_us recipient list about a new/unassigned/held conversation. */
export async function notifyNewConversation(conversation: Conversation, message: ConversationMessage, opts: { held?: boolean } = {}): Promise<boolean> {
  const cfg = getConfig()
  const recipients = await notificationRecipientService.getByGroup('contact_us')
  if (recipients.length === 0) return true

  const conversationUrl = `${cfg.siteUrl}/admin/inbox/${conversation.id}`
  const contactName = message.from_name || message.from_email || 'Contact'
  const contactEmail = message.from_email || ''

  const results = await Promise.allSettled(recipients.map(async (r) => {
    const replyTo = await replyToFor(r.email, conversation, cfg)
    const { html, text } = renderNotification({
      appName: cfg.appName,
      contactName,
      contactEmail,
      bodyHtml: message.body_stripped_html || message.body_html || '',
      conversationUrl,
      held: !!opts.held,
    })
    return inboxEmailService.send({
      from: `"${cfg.appName}" <${cfg.contactAddress}>`,
      to: r.email,
      subject: opts.held ? `[Review] ${conversation.subject || 'Inbox message'}` : `New message: ${conversation.subject || 'Inbox'}`,
      html,
      text,
      replyTo,
    })
  }))

  // Retry (via the queue) only if every recipient failed — a partial success must not
  // re-send to those who already received it, since per-recipient sends aren't idempotent.
  return results.some(r => r.status === 'fulfilled' && r.value?.success)
}

/** Notify the assignee about a reply on a conversation they own. */
export async function notifyAssignee(conversation: Conversation, message: ConversationMessage): Promise<boolean> {
  if (!conversation.assigned_user_id) return true
  const cfg = getConfig()
  const assignee = await userService.getUserById(conversation.assigned_user_id)
  if (!assignee?.email) return true

  const replyTo = await replyToFor(assignee.email, conversation, cfg)
  const conversationUrl = `${cfg.siteUrl}/admin/inbox/${conversation.id}`
  const { html, text } = renderNotification({
    appName: cfg.appName,
    contactName: message.from_name || message.from_email || 'Contact',
    contactEmail: message.from_email || '',
    bodyHtml: message.body_stripped_html || message.body_html || '',
    conversationUrl,
    held: false,
  })

  const result = await inboxEmailService.send({
    from: `"${cfg.appName}" <${cfg.contactAddress}>`,
    to: assignee.email,
    subject: `New reply: ${conversation.subject || 'Inbox'}`,
    html,
    text,
    replyTo,
  })
  return result.success
}

/** Email a sender whose message was held that they should log in to resolve it. */
export async function notifyHeldSender(toEmail: string, cfgOverride?: { appName?: string; contactAddress?: string }): Promise<boolean> {
  if (!toEmail) return true
  const cfg = getConfig()
  const appName = cfgOverride?.appName || cfg.appName
  const html = `
    <!DOCTYPE html>
    <html><head><meta charset="UTF-8"></head>
    <body style="font-family: -apple-system, sans-serif; line-height:1.6; color:#333; max-width:600px; margin:0 auto; padding:20px;">
      <p>Thanks for your message. We could not automatically match it to an existing conversation, so a member of our team will review it shortly.</p>
      <p>— ${escapeHtml(appName)}</p>
    </body></html>
  `
  const result = await inboxEmailService.send({
    from: `"${appName}" <${cfgOverride?.contactAddress || cfg.contactAddress}>`,
    to: toEmail,
    subject: 'We received your message',
    html,
    text: 'Thanks for your message. A member of our team will review it shortly.',
  })
  return result.success
}
