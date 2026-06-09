import type { Job, OutboundEmailPayload } from '../../database/job-queue'
import type { ProcessorResult } from './index'
import { messageService } from '../../database/conversation-messages'
import { conversationService } from '../../database/conversations'
import { conversationAttachmentService } from '../../database/conversation-attachments'
import { contactMethodService } from '../../database/contact-methods'
import { userService } from '../../database/users'
import { inboxEmailService, type InboxEmailAttachment } from '../../utils/inbox-email'
import { buildContactReplyAddress, buildFromAddress } from '../../utils/inbox-addressing'
import { getInlineImageObject } from '../../utils/app/inbox-inline-images'
import { renderInboxMessageEmail } from '../../utils/inbox-email-layout'
import { buildQuotedHtml, buildQuotedText } from '../../utils/inbox-quote'
import { sanitizeEmailHtml } from '../../utils/inbox-sanitize-html'

/**
 * Sends a queued outbound inbox message. The generic queue only tracks *job* status;
 * this processor owns the message-level state (sent/failed, provider id, failed reason).
 */
export async function processOutboundEmail(job: Job): Promise<ProcessorResult> {
  const payload = job.payload as OutboundEmailPayload
  const config = useRuntimeConfig()
  const inboxDomain = (config.inboxDomain || 'doxa.life').toLowerCase()
  const contactAddress = config.inboxContactAddress || 'contact@doxa.life'

  const message = await messageService.getById(payload.message_id)
  if (!message) return { success: false, data: { error: 'Message not found' } }
  if (message.status !== 'queued') {
    // Already handled (e.g. retried after success) — nothing to do.
    return { success: true, data: { skipped: message.status } }
  }

  const conversation = await conversationService.getById(message.conversation_id)
  if (!conversation || !conversation.subscriber_id) {
    await messageService.markStatus(message.id, 'failed', { failed_reason: 'Conversation or subscriber missing' })
    return { success: false, data: { error: 'Conversation or subscriber missing' } }
  }

  const sender = message.sender_user_id ? await userService.getUserById(message.sender_user_id) : null
  // Honor the From identity chosen at compose time (stored on the message's from_email):
  // the general contact address, or the sender's personal alias. Falls back to the
  // sender's alias when unset (e.g. reply-by-email).
  const useContact = (message.from_email || '').toLowerCase() === contactAddress.toLowerCase()
  let fromAddress: string
  if (useContact) {
    fromAddress = `"Doxa Prayer" <${contactAddress}>`
  } else if (message.from_email) {
    const first = (sender?.display_name || '').trim().split(/\s+/)[0] || 'Doxa'
    fromAddress = `"${first} with Doxa" <${message.from_email}>`
  } else {
    fromAddress = buildFromAddress({
      firstName: sender?.display_name,
      alias: sender?.email_alias,
      domain: inboxDomain,
      contactAddress,
    })
  }

  const lastInbound = await messageService.getLastInbound(conversation.id)

  // Reply to the address the contact actually used — the explicitly composed to_email, else
  // the address that last wrote in — falling back to the subscriber's primary email (which may
  // differ from the one that wrote in, and which getPrimaryEmail doesn't filter for suppression).
  // getLastInbound is received-only, so a held/wrong-From sender who knew the reply token can't
  // become the reply target.
  const recipientEmail = message.to_email
    || lastInbound?.from_email
    || (await contactMethodService.getPrimaryEmail(conversation.subscriber_id))?.value
    || null
  if (!recipientEmail) {
    await messageService.markStatus(message.id, 'failed', { failed_reason: 'No contact email' })
    return { success: false, data: { error: 'No contact email' } }
  }
  // Never (re)send to a suppressed address — hard bounce / complaint.
  if (await contactMethodService.isSuppressed(recipientEmail)) {
    await messageService.markStatus(message.id, 'failed', { failed_reason: 'Recipient suppressed' })
    return { success: true, data: { skipped: 'suppressed' } }
  }

  // Build a quoted history of the prior thread so the recipient's email has context
  // (the in-app thread shows messages individually, so we quote only on the sent copy).
  const prior = (await messageService.listForConversation(conversation.id)).filter(m => m.id !== message.id)
  const quotedHtml = buildQuotedHtml(prior)
  const quotedText = buildQuotedText(prior)
  // Sanitize the staff-composed body (which already includes the raw-appended signature and
  // any canned-response HTML) before it leaves the system — this is the one outbound sink
  // that carries staff content out from the brand domain. Quoted history is already sanitized.
  let html = sanitizeEmailHtml(message.body_html || '') + quotedHtml
  const text = (message.body_text || '') + quotedText

  // Re-attach any files linked to this outbound message
  const attachments: InboxEmailAttachment[] = []
  if (!process.env.VITEST) {
    const rows = await conversationAttachmentService.listForMessage(message.id)
    for (const row of rows) {
      try {
        const res = await fetch(await generateSignedUrl(row.s3_key))
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        attachments.push({
          filename: row.filename || 'attachment',
          contentType: row.content_type || 'application/octet-stream',
          data: Buffer.from(await res.arrayBuffer()),
        })
      } catch (err: any) {
        // Never send a reply with a missing attachment — the thread would falsely read "sent".
        // Fail/retry the job; mark the message failed only once retries are exhausted.
        const isLastAttempt = job.attempts >= job.max_attempts
        if (isLastAttempt) {
          await messageService.markStatus(message.id, 'failed', { failed_reason: 'Attachment fetch failed' })
        }
        throw new Error(`Attachment fetch failed for message ${message.id}: ${err?.message || err}`)
      }
    }

    // Inline composer images are stored in the private bucket and referenced by
    // an auth'd proxy URL (for in-app display). For the outbound email, embed
    // them as CID parts and rewrite the src to cid:, so nothing private leaves
    // the system on a public URL.
    const inline = await embedInlineImages(html)
    html = inline.html
    attachments.push(...inline.attachments)
  }

  // Cap image dimensions inline so they don't dominate the email (email clients
  // ignore <style>/external CSS, so the constraint must live on each <img>).
  html = constrainImages(html)

  // Wrap the assembled body + quoted history in the shared light inbox shell so
  // the reply renders in the brand font/color instead of the client default.
  // Wrapping last is safe: the image rewrites above operate on substrings that
  // survive wrapping. Locale here only sets the lang attribute.
  html = renderInboxMessageEmail({ bodyHtml: html, subject: message.subject || conversation.subject || undefined })

  // Atomically claim the message (queued → sent) right before sending, so a requeued or
  // concurrent job can't re-send it; a confirmed failure releases it back to 'queued' below.
  const claimed = await messageService.claimForSend(message.id)
  if (!claimed) return { success: true, data: { skipped: 'not_queued' } }

  const result = await inboxEmailService.send({
    from: fromAddress,
    to: recipientEmail,
    subject: message.subject || conversation.subject || 'Re:',
    html,
    text: text || undefined,
    replyTo: buildContactReplyAddress(conversation.reply_token, contactAddress),
    inReplyTo: lastInbound?.email_message_id || undefined,
    references: lastInbound?.email_message_id || undefined,
    attachments: attachments.length ? attachments : undefined,
  })

  if (result.success) {
    await messageService.markSent(message.id, result.providerMessageId)
    return { success: true }
  }

  // The claim above set the message 'sent'. On a returned failure, release it back to
  // 'queued' so a job retry re-claims and re-sends, or mark it permanently failed on the
  // final attempt. attempts is the post-claim count (claimJobs increments it), so this run
  // is the last when attempts >= max_attempts — the same point at which failOrRetry stops
  // requeuing the job, so the message and the job fail together (not one attempt early).
  const isLastAttempt = job.attempts >= job.max_attempts
  if (isLastAttempt) {
    await messageService.markStatus(message.id, 'failed', { failed_reason: result.error || 'Send failed' })
  } else {
    await messageService.markStatus(message.id, 'queued')
  }
  throw new Error(result.error || 'Send failed')
}

/**
 * Replace inline-image proxy URLs (`/api/admin/inbox/inline-image/inline/…`)
 * with CID references and return the matching inline attachments. Each unique
 * key is fetched once; the object's basename (`<hex>.<ext>`) doubles as both the
 * attachment filename and the Content-ID (Mailgun requires cid === filename).
 * Images that can't be fetched are left as-is rather than failing the send.
 */
async function embedInlineImages(html: string): Promise<{ html: string; attachments: InboxEmailAttachment[] }> {
  const attachments: InboxEmailAttachment[] = []
  const keyRe = /\/api\/admin\/inbox\/inline-image\/(inline\/[A-Za-z0-9/_-]+\.(?:jpg|png|gif|webp))/g
  const keys = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = keyRe.exec(html)) !== null) keys.add(m[1]!)
  if (keys.size === 0) return { html, attachments }

  let out = html
  for (const key of keys) {
    const obj = await getInlineImageObject(key)
    if (!obj) continue
    const cid = key.split('/').pop() as string
    attachments.push({ filename: cid, contentType: obj.contentType, data: obj.data, cid })
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const urlRe = new RegExp(`(?:https?:\\/\\/[^"'\\s)]+)?\\/api\\/admin\\/inbox\\/inline-image\\/${escaped}`, 'g')
    out = out.replace(urlRe, `cid:${cid}`)
  }
  return { html: out, attachments }
}

// Inject a responsive size cap onto every <img> in the outbound HTML. Merges
// with any existing style (ours appended last so it wins). Covers inline CID
// images, older public-URL images in quoted history, and inbound images.
function constrainImages(html: string): string {
  const STYLE = 'max-width:100%;max-height:480px;height:auto;'
  return html.replace(/<img\b([^>]*?)\/?>/gi, (_full, attrs: string) => {
    if (/\sstyle\s*=/i.test(attrs)) {
      const merged = attrs.replace(
        /(\sstyle\s*=\s*)("|')([\s\S]*?)\2/i,
        (_m, prefix: string, quote: string, val: string) => `${prefix}${quote}${val};${STYLE}${quote}`,
      )
      return `<img${merged}>`
    }
    return `<img${attrs} style="${STYLE}">`
  })
}

