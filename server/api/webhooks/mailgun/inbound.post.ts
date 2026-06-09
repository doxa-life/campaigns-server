import { createHash } from 'crypto'
import { conversationService, type Conversation } from '../../../database/conversations'
import { messageService, type ConversationMessage } from '../../../database/conversation-messages'
import { conversationAttachmentService } from '../../../database/conversation-attachments'
import { spamSenderService } from '../../../database/spam-senders'
import { subscriberService } from '../../../database/subscribers'
import { contactMethodService } from '../../../database/contact-methods'
import { userService } from '../../../database/users'
import { validateMailgunWebhook, releaseSeenToken } from '../../../utils/mailgun-webhook'
import { sanitizeEmailHtml } from '../../../utils/inbox-sanitize-html'
import { buildQuotedHtml, buildQuotedText } from '../../../utils/inbox-quote'
import { renderInboxMessageEmail } from '../../../utils/inbox-email-layout'
import {
  parseMessageHeaders,
  parseAuthentication,
  parseSpamScore,
  extractEmailAddress,
  extractDisplayName,
  isAutoResponderOrBounce,
  isVacationAutoReply,
} from '../../../utils/mailgun-inbound'
import { parseInboxRecipient, buildContactReplyAddress, buildFromAddress } from '../../../utils/inbox-addressing'
import { resolveSignedStaffSender } from '../../../utils/inbox-reply-auth'
import { inboxEmailService } from '../../../utils/inbox-email'
import { jobQueueService, type InboxEmailPayload } from '../../../database/job-queue'

// Transient failures bubble up as this so the catch can return a retryable 5xx.
class TransientError extends Error {}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  // --- Read payload (multipart or urlencoded) ---
  let form: FormData
  try {
    form = await readFormData(event)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Malformed payload' })
  }
  const field = (name: string): string | null => {
    const v = form.get(name)
    return typeof v === 'string' ? v : null
  }

  // Persist a message's attachments + raw MIME to S3. On failure, RELEASE the message row
  // (delete it) before retrying, so the redelivery re-inserts and re-runs persistence
  // instead of dedup-skipping it — otherwise a storage hiccup mid-receive would lose the
  // attachment + raw MIME for good. Call this BEFORE any outbound send so a release can
  // never leave an already-sent forward to be re-sent.
  const persistArtifacts = async (msgId: number): Promise<void> => {
    if (process.env.VITEST) return
    try {
      await persistAttachments(form, msgId)
      const rawMime = field('body-mime')
      if (rawMime) {
        const upload = await uploadToS3(Buffer.from(rawMime, 'utf-8'), `raw-${msgId}.eml`, 'message/rfc822')
        await sql`UPDATE conversation_messages SET raw_s3_key = ${upload.key} WHERE id = ${msgId}`
      }
    } catch (s3err: any) {
      await messageService.deleteById(msgId)
      throw new TransientError(s3err?.message || 'Attachment persistence failed')
    }
  }

  // --- 1. Verify Mailgun webhook signature (skipped in tests unless explicitly exercised) ---
  const enforceSignature = !process.env.VITEST || field('x-test-verify-sig') === '1'
  const sigToken = field('token') || ''
  if (enforceSignature) {
    const result = validateMailgunWebhook(
      { timestamp: field('timestamp') || '', token: sigToken, signature: field('signature') || '' },
      config.mailgunWebhookSigningKey
    )
    if (!result.ok) {
      throw createError({ statusCode: 406, statusMessage: result.reason || 'Invalid signature' })
    }
  }

  // --- Gather fields ---
  const recipient = field('recipient') || ''
  const fromHeaderRaw = field('from') || field('sender') || ''
  const fromEmail = extractEmailAddress(fromHeaderRaw)
  const fromName = extractDisplayName(fromHeaderRaw)
  const subject = field('subject') || ''
  const bodyHtml = field('body-html') || ''
  const bodyStrippedHtml = field('stripped-html') || ''
  const bodyText = field('stripped-text') || field('body-plain') || ''

  if (!recipient || !fromEmail) {
    throw createError({ statusCode: 400, statusMessage: 'Missing recipient or sender' })
  }

  const headers = parseMessageHeaders(field('message-headers'))
  const messageId = headers.get('message-id') || field('Message-Id') || null
  const inReplyTo = headers.get('in-reply-to') || null
  const references = headers.get('references') || null
  const auth = parseAuthentication(headers, fromEmail)
  const spamScore = parseSpamScore(headers, Object.fromEntries(form.entries()))

  const parsedRecipient = parseInboxRecipient(recipient)
  const inboxDomain = (config.inboxDomain || 'doxa.life').toLowerCase()
  const domainMatches = parsedRecipient?.domain === inboxDomain

  // --- 2. Idempotency ---
  // Prefer the real Message-Id; synthesize a stable key from the envelope when the mail
  // has none, so a redelivery of a header-less message dedupes instead of duplicating
  // (a NULL email_message_id never conflicts, so otherwise every retry would re-insert).
  const dedupeKey = messageId || synthesizeMessageId({
    from: fromEmail,
    recipient,
    subject,
    date: headers.get('date') || '',
    body: bodyText || bodyHtml || '',
  })
  const existing = await messageService.findByEmailMessageId(dedupeKey)
  if (existing) {
    return { status: 'duplicate', message_id: existing.id }
  }

  // Everything below must be durable before we 200. Transient DB/S3 errors → retryable 5xx.
  try {
    if (process.env.VITEST && field('x-test-fail') === 'db') {
      throw new TransientError('Simulated transient persistence failure')
    }

    // --- 3. Spam blocklist: attach + auto-close, stop ---
    if (await spamSenderService.isBlocked(fromEmail)) {
      const { subscriber } = await subscriberService.findOrCreateSubscriber({ email: fromEmail, name: fromName || fromEmail })
      await subscriberService.addSource(subscriber.id, 'inbox')
      // Reuse the sender's existing spam thread instead of spawning a new conversation
      // for every blocked message — keeps a repeat spammer from inflating the table.
      const latest = await conversationService.getLatestForSubscriber(subscriber.id)
      const convo = latest && latest.status === 'spam'
        ? latest
        : await conversationService.create({
            subscriber_id: subscriber.id,
            subject: subject || null,
            status: 'spam',
          })
      const spamMsg = await messageService.createIfNew({
        conversation_id: convo.id,
        direction: 'inbound',
        status: 'received',
        from_email: fromEmail,
        from_name: fromName,
        to_email: recipient,
        subject,
        body_html: bodyHtml,
        body_stripped_html: bodyStrippedHtml,
        body_text: bodyText,
        email_message_id: dedupeKey,
        in_reply_to: inReplyTo,
        email_references: references,
        spam_score: spamScore,
        authenticated: auth.authenticated,
        auth_result: auth.authResult,
      })
      if (!spamMsg) return { status: 'duplicate', conversation_id: convo.id }
      await conversationService.closeForSubscriberAsSpam(subscriber.id)
      return { status: 'spam', conversation_id: convo.id }
    }

    // --- 4. Resolve conversation ---
    let conversation: Conversation | null = null
    let aliasUser: Awaited<ReturnType<typeof userService.getByEmailAlias>> = null

    if (domainMatches && parsedRecipient) {
      if (parsedRecipient.token) {
        conversation = await conversationService.findByReplyToken(parsedRecipient.token)
      }
      if (!conversation && (inReplyTo || references)) {
        const ids = [inReplyTo, ...(references ? references.split(/\s+/) : [])].filter(Boolean) as string[]
        const convoId = await messageService.findConversationByMessageIds(ids)
        if (convoId) {
          const candidate = await conversationService.getById(convoId)
          // In-Reply-To/References are attacker-controlled, so only thread into an existing
          // conversation when the From actually belongs to that thread's subscriber. Otherwise
          // anyone who learns a message-id could graft forged mail onto a victim's thread; such
          // mail instead falls through to a fresh conversation (and is held if the sender is unknown).
          if (candidate?.subscriber_id) {
            const cm = await contactMethodService.getByValue('email', fromEmail)
            if (cm && cm.subscriber_id === candidate.subscriber_id) {
              conversation = candidate
            }
          }
        }
      }
      if (!conversation && !parsedRecipient.token) {
        const contactBase = (config.inboxContactAddress || 'contact@doxa.life').split('@')[0]!.toLowerCase()
        if (parsedRecipient.base && parsedRecipient.base !== contactBase) {
          aliasUser = await userService.getByEmailAlias(parsedRecipient.base)
        }
      }
    }

    const isNewConversation = !conversation
    let subscriberIdForNew: number | null = null

    if (!conversation) {
      const { subscriber } = await subscriberService.findOrCreateSubscriber({ email: fromEmail, name: fromName || fromEmail })
      await subscriberService.addSource(subscriber.id, 'inbox')
      subscriberIdForNew = subscriber.id
      conversation = await conversationService.create({
        subscriber_id: subscriber.id,
        subject: subject || null,
        status: 'open',
        assigned_user_id: aliasUser?.id ?? null,
      })
    }

    // --- 5. Determine direction (never trust From alone) ---
    const staffUser = parsedRecipient?.sig
      ? await resolveSignedStaffSender({
          conversationId: conversation.id,
          exp: parsedRecipient.exp,
          sig: parsedRecipient.sig,
          secret: config.inboxReplySecret || config.jwtSecret || '',
        })
      : null

    // Does the sender match the conversation's contact (subscriber email)?
    let senderIsContact = isNewConversation
    let contactMethodId: number | null = null
    if (!isNewConversation && conversation.subscriber_id) {
      const cm = await contactMethodService.getByValue('email', fromEmail)
      if (cm && cm.subscriber_id === conversation.subscriber_id) {
        senderIsContact = true
        contactMethodId = cm.id
      }
    } else if (isNewConversation) {
      const cm = await contactMethodService.getByValue('email', fromEmail)
      contactMethodId = cm?.id ?? null
    }

    let outcome: 'staff' | 'contact' | 'held'
    if (staffUser && auth.authenticated) {
      outcome = 'staff'
    } else if (senderIsContact && !parsedRecipient?.sig) {
      outcome = 'contact'
    } else {
      // Unknown sender, invalid/expired sig, or unauthenticated staff attempt
      outcome = 'held'
    }

    // A vacation / out-of-office auto-reply from the contact shouldn't re-open the thread or
    // ping staff — flag it so the contact branch closes it out instead. Bounces are excluded.
    const isVacationReply = outcome === 'contact' && isVacationAutoReply(headers, fromEmail)

    let storedMessage: ConversationMessage

    if (outcome === 'staff') {
      // Record the staff reply as outbound and forward it onward to the contact.
      const lastInbound = await messageService.getLastInbound(conversation.id)
      const primaryContactEmail = conversation.subscriber_id
        ? (await contactMethodService.getPrimaryEmail(conversation.subscriber_id))?.value || null
        : null
      const contactEmail = lastInbound?.from_email || primaryContactEmail
      // Snapshot the thread for the quoted history BEFORE claiming the new row, so the
      // forward never quotes the staff's own message back to the contact.
      const priorMessages = await messageService.listForConversation(conversation.id)

      // Claim the durable row FIRST — its unique email_message_id is the idempotency
      // point, so a concurrent or retried delivery can't pass this and forward twice.
      // The forward is sent only after the claim succeeds; a *confirmed* send failure
      // releases the claim so the redelivery resends. This is at-most-once: a hard crash
      // between the insert and the send completing leaves the row reading 'sent' and the
      // redelivery dedupes (line ~114), so the forward can be lost — but never double-sent.
      // Deliberate tradeoff vs the old send-then-store ordering, which could double-send.
      const claimed = await messageService.createIfNew({
        conversation_id: conversation.id,
        direction: 'outbound',
        status: 'sent',
        sender_user_id: staffUser!.id,
        from_email: staffUser!.email_alias ? `${staffUser!.email_alias}@${inboxDomain}` : (config.inboxContactAddress || 'contact@doxa.life'),
        from_name: staffUser!.display_name,
        to_email: contactEmail,
        subject,
        body_html: bodyHtml,
        body_stripped_html: bodyStrippedHtml,
        body_text: bodyText,
        // Holds the inbound Message-Id (or its synthesized stand-in) so a retried
        // webhook dedupes here. The forward's provider id lands in provider_message_id.
        email_message_id: dedupeKey,
        in_reply_to: inReplyTo,
        email_references: references,
        authenticated: auth.authenticated,
        auth_result: auth.authResult,
      })
      if (!claimed) return { status: 'duplicate', conversation_id: conversation.id }
      storedMessage = claimed
      // Persist attachments/raw MIME BEFORE forwarding, so a storage failure releases the
      // claim and the redelivery redoes it — never re-sending an already-sent forward.
      await persistArtifacts(storedMessage.id)

      let forwarded = false
      if (!contactEmail) {
        await messageService.markStatus(storedMessage.id, 'failed', { failed_reason: 'No contact email' })
      } else if (await contactMethodService.isSuppressed(contactEmail)) {
        await messageService.markStatus(storedMessage.id, 'failed', { failed_reason: 'Recipient suppressed' })
      } else {
        const fromAddress = buildFromAddress({
          firstName: staffUser!.display_name,
          alias: staffUser!.email_alias,
          domain: inboxDomain,
          contactAddress: config.inboxContactAddress || 'contact@doxa.life',
        })
        // Forward only the staff's new content to the contact — never the
        // notification chrome their mail client quoted back ("open the
        // conversation" link, automated-notification footer, admin-only "From:"
        // header). Mailgun's stripped-html removes that block.
        //
        // Then append the conversation's prior messages as a Gmail-style
        // quoted history so the contact has context for what's being answered
        // (matters when the original came from a contact form, when the
        // contact sent multiple messages, or when their client doesn't thread).
        // Mirrors what the UI reply path does in the outbound-email job.
        const newHtml = sanitizeEmailHtml(bodyStrippedHtml || bodyHtml)
        const composedHtml = renderInboxMessageEmail({
          bodyHtml: newHtml + buildQuotedHtml(priorMessages),
          subject: subject || conversation.subject || undefined,
        })
        const composedText = (bodyText || '') + buildQuotedText(priorMessages)
        const sent = await inboxEmailService.send({
          from: fromAddress,
          to: contactEmail,
          subject: subject || conversation.subject || 'Re:',
          html: composedHtml,
          text: composedText || undefined,
          replyTo: buildContactReplyAddress(conversation.reply_token, config.inboxContactAddress || 'contact@doxa.life'),
          inReplyTo: lastInbound?.email_message_id || undefined,
          references: lastInbound?.email_message_id || undefined,
        })
        if (!sent.success) {
          // Confirmed failure (the provider returned an error — not a crash): release the
          // claim so the redelivery re-sends instead of dedup-skipping a never-sent forward.
          await messageService.deleteById(storedMessage.id)
          throw new TransientError(sent.error || 'Staff reply forward failed')
        }
        if (sent.providerMessageId) {
          await messageService.markStatus(storedMessage.id, 'sent', { provider_message_id: sent.providerMessageId })
        }
        forwarded = true
      }
      if (forwarded) {
        await conversationService.updateStatus(conversation.id, 'pending')
        await conversationService.setNeedsReview(conversation.id, false)
      } else {
        await conversationService.setNeedsReview(conversation.id, true)
      }
      await conversationService.assignIfUnassigned(conversation.id, staffUser!.id)
      await conversationService.touchLastMessage(conversation.id, storedMessage.created_at, 'outbound')
    } else if (outcome === 'contact') {
      const claimed = await messageService.createIfNew({
        conversation_id: conversation.id,
        direction: 'inbound',
        status: 'received',
        from_email: fromEmail,
        from_name: fromName,
        to_email: recipient,
        subject,
        body_html: bodyHtml,
        body_stripped_html: bodyStrippedHtml,
        body_text: bodyText,
        email_message_id: dedupeKey,
        in_reply_to: inReplyTo,
        email_references: references,
        spam_score: spamScore,
        authenticated: auth.authenticated,
        auth_result: auth.authResult,
      })
      if (!claimed) return { status: 'duplicate', conversation_id: conversation.id }
      storedMessage = claimed
      await persistArtifacts(storedMessage.id)
      // Contact replied → the ball is back with the team. Flip pending
      // ("waiting on the contact") or closed ("done") back to open so it
      // surfaces as needing attention. Leave spam alone. A vacation / out-of-office
      // auto-reply is the exception: close it instead of re-opening or notifying.
      if (isVacationReply) {
        await conversationService.updateStatus(conversation.id, 'closed')
      } else if (conversation.status === 'pending' || conversation.status === 'closed') {
        await conversationService.updateStatus(conversation.id, 'open')
      }
      await conversationService.touchLastMessage(conversation.id, storedMessage.created_at, 'inbound')
      if (subject) await conversationService.setSubject(conversation.id, subject)

      // Authenticated inbound proves ownership → mark the contact method verified
      if (auth.authenticated && contactMethodId) {
        await contactMethodService.markVerified(contactMethodId)
      }
    } else {
      // held
      const claimed = await messageService.createIfNew({
        conversation_id: conversation.id,
        direction: 'inbound',
        status: 'held',
        from_email: fromEmail,
        from_name: fromName,
        to_email: recipient,
        subject,
        body_html: bodyHtml,
        body_stripped_html: bodyStrippedHtml,
        body_text: bodyText,
        email_message_id: dedupeKey,
        in_reply_to: inReplyTo,
        email_references: references,
        spam_score: spamScore,
        authenticated: auth.authenticated,
        auth_result: auth.authResult,
        hold_reason: staffUser ? 'Unauthenticated staff reply' : 'Unknown sender',
      })
      if (!claimed) return { status: 'duplicate', conversation_id: conversation.id }
      storedMessage = claimed
      await persistArtifacts(storedMessage.id)
      await conversationService.setNeedsReview(conversation.id, true)
      await conversationService.touchLastMessage(conversation.id, storedMessage.created_at, 'inbound')
    }

    logCreate('conversations', String(conversation.id), undefined, {
      message: `Inbound email (${outcome}${isVacationReply ? ', auto-reply → closed' : ''})`,
      direction: outcome === 'staff' ? 'outbound' : 'inbound',
      authenticated: auth.authenticated,
    })

    // --- 8. Notify (after durable persist) — enqueued so a transient send failure is
    // retried by the queue instead of being silently lost, and the webhook responds fast.
    try {
      const refOpts = { referenceType: 'conversation', referenceId: conversation.id }
      if (outcome === 'held') {
        await jobQueueService.createJob<InboxEmailPayload>('inbox_email', { kind: 'new_conversation', conversation_id: conversation.id, message_id: storedMessage.id, held: true }, refOpts)
        // Courtesy-reply to the sender only when the inbound actually authenticated (a forged
        // From must not trigger backscatter) and isn't itself an auto-responder/bounce (no loop).
        if (auth.authenticated && !isAutoResponderOrBounce(headers, fromEmail)) {
          await jobQueueService.createJob<InboxEmailPayload>('inbox_email', { kind: 'held_sender', to: fromEmail }, refOpts)
        }
      } else if (outcome === 'contact') {
        // A vacation / out-of-office auto-reply was auto-closed above — don't notify staff about it.
        if (!isVacationReply) {
          if (conversation.assigned_user_id) {
            await jobQueueService.createJob<InboxEmailPayload>('inbox_email', { kind: 'assignee', conversation_id: conversation.id, message_id: storedMessage.id }, refOpts)
          } else {
            await jobQueueService.createJob<InboxEmailPayload>('inbox_email', { kind: 'new_conversation', conversation_id: conversation.id, message_id: storedMessage.id }, refOpts)
          }
        }
        // Auto-ack only for brand-new cold conversations (not ongoing replies), and only when
        // the inbound authenticated — a forged From must not trigger an ack to the victim.
        if (isNewConversation && auth.authenticated && !isAutoResponderOrBounce(headers, fromEmail)) {
          await jobQueueService.createJob<InboxEmailPayload>('inbox_email', { kind: 'auto_ack', conversation_id: conversation.id, to: fromEmail, name: fromName, language: 'en' }, refOpts)
        }
      }
    } catch (notifyErr: any) {
      console.error('[InboundWebhook] Enqueue of notifications failed:', notifyErr?.message || notifyErr)
    }

    return { status: outcome, conversation_id: conversation.id, message_id: storedMessage.id }
  } catch (error: any) {
    // This token was marked "seen" during signature validation. Since we're about to
    // return a retryable 5xx, release it so the provider's retry (which resends the same
    // token) isn't rejected as a replay and the message isn't lost.
    if (sigToken) releaseSeenToken(sigToken)
    if (error instanceof TransientError) {
      throw createError({ statusCode: 503, statusMessage: 'Temporary failure, please retry' })
    }
    // The message dedupe race is handled by createIfNew's ON CONFLICT DO NOTHING (it returns
    // null, never raises 23505), so any unique violation reaching here is from an unrelated
    // constraint — retry it (treated as transient) rather than report 200 "handled", which
    // would silently drop a message that wasn't persisted. Unknown errors are transient too.
    console.error('[InboundWebhook] Persistence error:', error?.message || error)
    throw createError({ statusCode: 503, statusMessage: 'Temporary failure, please retry' })
  }
})

// Deterministic stand-in Message-Id for inbound mail that arrives without one, so a
// redelivery of the same message dedupes (same envelope → same key) instead of
// re-creating the conversation and re-firing acks/notifications.
function synthesizeMessageId(parts: { from: string; recipient: string; subject: string; date: string; body: string }): string {
  const hash = createHash('sha256')
    .update([parts.from, parts.recipient, parts.subject, parts.date, parts.body].join('\n'))
    .digest('hex')
  return `<synthesized-${hash}@inbound.local>`
}

async function persistAttachments(form: FormData, messageId: number): Promise<void> {
  const blocked = /\.(exe|bat|cmd|com|scr|js|jar|vbs|ps1|sh|msi|dll)$/i
  for (const [, value] of form.entries()) {
    if (typeof value === 'string') continue
    const file = value as File
    if (!file.name) continue
    if (blocked.test(file.name)) continue
    if (file.size > 25 * 1024 * 1024) continue
    const buffer = Buffer.from(await file.arrayBuffer())
    const upload = await uploadToS3(buffer, file.name, file.type || 'application/octet-stream')
    await conversationAttachmentService.create({
      message_id: messageId,
      s3_key: upload.key,
      filename: file.name,
      content_type: file.type || null,
      size_bytes: file.size,
    })
  }
}
