import { createHash } from 'crypto'
import { conversationService, type Conversation } from '../database/conversations'
import { messageService, type ConversationMessage } from '../database/conversation-messages'
import { conversationAttachmentService } from '../database/conversation-attachments'
import { spamSenderService } from '../database/spam-senders'
import { subscriberService } from '../database/subscribers'
import { contactMethodService } from '../database/contact-methods'
import { userService } from '../database/users'
import { sanitizeEmailHtml } from './inbox-sanitize-html'
import { buildQuotedHtml, buildQuotedText } from './inbox-quote'
import { renderInboxMessageEmail } from './inbox-email-layout'
import {
  type InboundHeaders,
  isAutoResponderOrBounce,
  isVacationAutoReply,
} from './mailgun-inbound'
import { parseInboxRecipient, isBounceRecipient, buildContactReplyAddress, buildFromAddress } from './inbox-addressing'
import { resolveSignedStaffSender } from './inbox-reply-auth'
import { inboxEmailService } from './inbox-email'
import { jobQueueService, type InboxEmailPayload } from '../database/job-queue'

/**
 * Provider-neutral inbound email pipeline for the shared inbox: spam blocklist,
 * conversation resolution, staff/contact/held outcome, durable persistence
 * (message + attachments + raw MIME), and notification enqueueing.
 *
 * The provider webhooks (Mailgun form-forward, SES via SNS+S3) verify their own
 * transport signatures, extract these fields from their payload shape, and map
 * the result / thrown TransientInboundError back to their retry semantics.
 */

// Transient failures bubble up as this so callers can return a retryable 5xx.
export class TransientInboundError extends Error {}

export interface InboundAttachment {
  filename: string
  contentType: string
  size: number
  data: Buffer
}

export interface InboundEmailInput {
  recipient: string
  fromEmail: string
  fromName: string | null
  subject: string
  bodyHtml: string
  bodyStrippedHtml: string
  bodyText: string
  headers: InboundHeaders
  messageId: string | null
  spamScore: number | null
  auth: { authenticated: boolean; authResult: string | null }
  attachments: InboundAttachment[]
  rawMime: Buffer | null
  // VITEST hook: simulate a transient persistence failure after dedupe.
  simulateDbFailure?: boolean
}

export interface InboundResult {
  status: 'ignored' | 'duplicate' | 'spam' | 'staff' | 'contact' | 'held'
  reason?: string
  conversation_id?: number
  message_id?: number
}

/** Attachment storage rules shared by all providers (adapters filter before buffering). */
export function isStorableAttachment(filename: string | null | undefined, size: number): boolean {
  if (!filename) return false
  if (/\.(exe|bat|cmd|com|scr|js|jar|vbs|ps1|sh|msi|dll)$/i.test(filename)) return false
  if (size > 25 * 1024 * 1024) return false
  return true
}

export async function processInboundEmail(input: InboundEmailInput): Promise<InboundResult> {
  const config = useRuntimeConfig()
  const { recipient, fromEmail, fromName, subject, bodyHtml, bodyStrippedHtml, bodyText, headers, spamScore, auth } = input

  // Persist a message's attachments + raw MIME to S3. On failure, RELEASE the message row
  // (delete it) before retrying, so the redelivery re-inserts and re-runs persistence
  // instead of dedup-skipping it — otherwise a storage hiccup mid-receive would lose the
  // attachment + raw MIME for good. Call this BEFORE any outbound send so a release can
  // never leave an already-sent forward to be re-sent.
  const persistArtifacts = async (msgId: number): Promise<void> => {
    if (process.env.VITEST) return
    try {
      for (const att of input.attachments) {
        if (!isStorableAttachment(att.filename, att.size)) continue
        const upload = await uploadToS3(att.data, att.filename, att.contentType || 'application/octet-stream')
        await conversationAttachmentService.create({
          message_id: msgId,
          s3_key: upload.key,
          filename: att.filename,
          content_type: att.contentType || null,
          size_bytes: att.size,
        })
      }
      if (input.rawMime) {
        const upload = await uploadToS3(input.rawMime, `raw-${msgId}.eml`, 'message/rfc822')
        await sql`UPDATE conversation_messages SET raw_s3_key = ${upload.key} WHERE id = ${msgId}`
      }
    } catch (s3err: any) {
      await messageService.deleteById(msgId)
      throw new TransientInboundError(s3err?.message || 'Attachment persistence failed')
    }
  }

  const messageId = input.messageId
  const inReplyTo = headers.get('in-reply-to') || null
  const references = headers.get('references') || null

  const parsedRecipient = parseInboxRecipient(recipient)
  const inboxDomain = (config.inboxDomain || 'doxa.life').toLowerCase()
  const domainMatches = parsedRecipient?.domain === inboxDomain

  // Mail to the VERP bounce/return-path (bounce+...@<inboxDomain>) is machine-to-machine,
  // not human inbox mail. RFC 3834 vacation responders reply to the Return-Path, so they
  // land here; ingesting them spawns bogus "Unknown sender" conversations that ping staff.
  // Drop them — real bounces/complaints are handled by the delivery/event webhooks +
  // contact-method suppression list.
  if (domainMatches && isBounceRecipient(parsedRecipient)) {
    return { status: 'ignored', reason: 'bounce_address' }
  }

  // --- Idempotency ---
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
  if (input.simulateDbFailure) {
    throw new TransientInboundError('Simulated transient persistence failure')
  }

  // --- Spam blocklist: attach + auto-close, stop ---
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

  // --- Resolve conversation ---
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

  if (!conversation) {
    const { subscriber } = await subscriberService.findOrCreateSubscriber({ email: fromEmail, name: fromName || fromEmail })
    await subscriberService.addSource(subscriber.id, 'inbox')
    // Reuse a recent message-less conversation for this sender if one exists. A delivery
    // that fails after the conversation row is created (e.g. attachment storage down) is
    // retried by the provider; reusing the empty shell makes those retries converge on a
    // single conversation instead of spawning a fresh empty one on every retry.
    conversation = await conversationService.getRecentEmptyForSubscriber(subscriber.id)
    if (!conversation) {
      conversation = await conversationService.create({
        subscriber_id: subscriber.id,
        subject: subject || null,
        status: 'open',
        assigned_user_id: aliasUser?.id ?? null,
        source: 'inbound_email',
      })
      // Log creation here, before the message is stored, so the conversation keeps a full
      // origin trail (source + the address it arrived on) even if the message step fails or
      // dedups away — leaving a message-less conversation that stays visible as a signal
      // to investigate rather than a silent, dateless mystery.
      logCreate('conversations', String(conversation.id), undefined, {
        message: 'Inbound conversation created',
        source: 'inbound_email',
        received_on: recipient,
        direction: 'inbound',
      })
    }
  }

  // --- Determine direction (never trust From alone) ---
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

  // A vacation / out-of-office auto-reply shouldn't re-open the thread, flag it for review,
  // or ping staff. Detect it independently of outcome so a reply that lands as `held`
  // (responder replied to From instead of the Return-Path) is suppressed too. Bounces are
  // excluded. `isVacationReply` drives the contact branch's close-instead-of-reopen.
  const looksAutoReply = isVacationAutoReply(headers, fromEmail)
  const isVacationReply = outcome === 'contact' && looksAutoReply

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
    // redelivery dedupes (idempotency check above), so the forward can be lost — but
    // never double-sent. Deliberate tradeoff vs a send-then-store ordering, which could
    // double-send.
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
      // header). The stripped-html variant removes that block.
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
        throw new TransientInboundError(sent.error || 'Staff reply forward failed')
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
    // An out-of-office / auto-reply from an unrecognised sender is noise, not an inquiry —
    // close it quietly instead of flagging it for review (notifications skipped below).
    if (looksAutoReply) {
      await conversationService.updateStatus(conversation.id, 'closed')
    } else {
      await conversationService.setNeedsReview(conversation.id, true)
    }
    await conversationService.touchLastMessage(conversation.id, storedMessage.created_at, 'inbound')
  }

  logCreate('conversations', String(conversation.id), undefined, {
    message: `Inbound email (${outcome}${looksAutoReply && outcome !== 'staff' ? ', auto-reply → closed' : ''})`,
    direction: outcome === 'staff' ? 'outbound' : 'inbound',
    authenticated: auth.authenticated,
  })

  // --- Notify (after durable persist) — enqueued so a transient send failure is
  // retried by the queue instead of being silently lost, and the webhook responds fast.
  try {
    const refOpts = { referenceType: 'conversation', referenceId: conversation.id }
    if (outcome === 'held') {
      // A held auto-reply was auto-closed above — don't flag it to staff or courtesy-reply.
      if (!looksAutoReply) {
        await jobQueueService.createJob<InboxEmailPayload>('inbox_email', { kind: 'new_conversation', conversation_id: conversation.id, message_id: storedMessage.id, held: true }, refOpts)
        // Courtesy-reply to the sender only when the inbound actually authenticated (a forged
        // From must not trigger backscatter) and isn't itself an auto-responder/bounce (no loop).
        if (auth.authenticated && !isAutoResponderOrBounce(headers, fromEmail)) {
          await jobQueueService.createJob<InboxEmailPayload>('inbox_email', { kind: 'held_sender', to: fromEmail }, refOpts)
        }
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
}

// Deterministic stand-in Message-Id for inbound mail that arrives without one, so a
// redelivery of the same message dedupes (same envelope → same key) instead of
// re-creating the conversation and re-firing acks/notifications.
function synthesizeMessageId(parts: { from: string; recipient: string; subject: string; date: string; body: string }): string {
  const hash = createHash('sha256')
    .update([parts.from, parts.recipient, parts.subject, parts.date, parts.body].join('\n'))
    .digest('hex')
  return `<synthesized-${hash}@inbound.local>`
}
