import type { H3Event } from 'h3'
import { subscriberService } from '../database/subscribers'
import { contactMethodService } from '../database/contact-methods'
import { conversationService } from '../database/conversations'
import { messageService } from '../database/conversation-messages'
import { jobQueueService, type InboxEmailPayload } from '../database/job-queue'
import { sendContactVerificationEmail } from './contact-verification-email'
import { trackEventInBackground, userHashFromEmail } from './tracking'

// Local helper (not exported) to avoid colliding with the auto-imported
// escapeHtml in server/utils/translations.ts.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export type FeedbackType = 'compliment' | 'suggestion' | 'problem'

// Display labels used for the conversation subject prefix. The matching
// filterable inbox tags (`feedback-<type>`) are seeded in the tag palette by
// server/plugins/seed-feedback-tags.ts.
const FEEDBACK_LABELS: Record<FeedbackType, string> = {
  compliment: 'Compliment',
  suggestion: 'Suggestion',
  problem: 'Problem',
}

// Device fields the app may attach to feedback, with the order + labels used when
// rendering the "Device info" block. app_version/app_build are merged into one line.
const DEVICE_LABELS: { key: string; label: string }[] = [
  { key: 'platform', label: 'Platform' },
  { key: 'os_version', label: 'OS version' },
  { key: 'device_model', label: 'Device' },
  { key: 'timezone', label: 'Timezone' },
]

/**
 * Renders an app-provided device map into plain-text and HTML "Device info"
 * blocks, or null when there's nothing to show. Values are caller-sanitised;
 * HTML output is additionally escaped here. app_version + app_build collapse
 * into a single "App version: 1.10.0 (17)" line.
 */
function renderDeviceInfo(device: Record<string, string>): { text: string; html: string } | null {
  const lines: { label: string; value: string }[] = []
  for (const { key, label } of DEVICE_LABELS) {
    const value = device[key]?.trim()
    if (value) lines.push({ label, value })
  }
  const appVersion = device.app_version?.trim()
  if (appVersion) {
    const build = device.app_build?.trim()
    lines.push({ label: 'App version', value: build ? `${appVersion} (${build})` : appVersion })
  }
  if (lines.length === 0) return null

  const text = ['', '—', 'Device info', ...lines.map(l => `${l.label}: ${l.value}`)].join('\n')
  const html =
    '<hr><p><strong>Device info</strong><br>' +
    lines.map(l => `${escapeHtml(l.label)}: ${escapeHtml(l.value)}`).join('<br>') +
    '</p>'
  return { text, html }
}

export interface SubmitContactInput {
  /** Trimmed display name; '' when the form omitted it. */
  name: string
  /** Lowercased + already validated email. */
  email: string
  /** Trimmed + already validated message body. */
  message: string
  country: string | null
  language: string
  consentDoxaGeneral?: boolean
  /** App-provided anonymous identity; links the message to that subscriber. */
  trackingId?: string | null
  /** When set, this submission is feedback rather than a plain contact message. */
  feedbackType?: FeedbackType | null
  /** App-provided device diagnostics (already sanitised by the caller). */
  device?: Record<string, string> | null
}

/**
 * Shared contact/feedback pipeline: resolve the subscriber, record consent,
 * open an inbox conversation with the first inbound message, enqueue the
 * auto-ack + staff-notification emails, and emit the tracking event.
 *
 * Used by both the key-gated /api/contact (external/marketing-site callers) and
 * the public, rate-limited /api/feedback (the mobile app's web form). The two
 * differ only in how the caller is authenticated and in the feedback options
 * passed here.
 */
export async function submitContactMessage(event: H3Event, input: SubmitContactInput): Promise<void> {
  const { email, message, country, language } = input
  const name = input.name
  const feedbackType = input.feedbackType ?? null
  const isFeedback = !!feedbackType

  // Identity: when the caller supplies a tracking_id, attach to that existing
  // anonymous subscriber (email stays canonical); otherwise match on email alone.
  const { subscriber, isNew } = input.trackingId
    ? await subscriberService.findOrCreateForNews({
        email,
        name: name || email,
        country,
        language,
        trackingId: input.trackingId,
      })
    : await subscriberService.findOrCreateSubscriber({
        email,
        name: name || email,
        country,
      })

  if (!isNew && country && subscriber.country !== country) {
    await subscriberService.updateSubscriber(subscriber.id, { country })
  }

  await subscriberService.addSource(subscriber.id, isFeedback ? 'feedback' : 'contact')

  if (input.consentDoxaGeneral) {
    const emailContact = await contactMethodService.getByValue('email', email)
    if (emailContact) {
      await contactMethodService.updateDoxaConsent(emailContact.id, true)

      if (!emailContact.verified) {
        // Reuse a still-valid link; only mail when it's the first one outstanding.
        const { token, isNew: isNewToken } = await contactMethodService.generateVerificationToken(emailContact.id)
        if (isNewToken) {
          sendContactVerificationEmail(email, token, name || email, language)
            .catch(err => console.error('Failed to send contact verification email:', err))
        }
      }
    }
  }

  logCreate('subscribers', String(subscriber.id), event, {
    source: isFeedback ? 'Feedback Form' : 'Contact Form',
    message: isFeedback ? 'Feedback form submitted' : 'Contact form submitted',
    form_values: {
      name,
      email,
      message,
      country,
      consent_doxa_general: input.consentDoxaGeneral ?? false,
      ...(isFeedback ? { feedback_type: feedbackType } : {}),
    },
  })

  // Open a conversation in the shared inbox with the form message as the first
  // inbound message. Feedback gets a `[Type]` subject prefix and source so staff
  // can tell it apart from a plain contact-form message at a glance.
  const firstLine = message.split('\n')[0] || (isFeedback ? 'Feedback' : 'Contact form message')
  const subject = (isFeedback ? `[${FEEDBACK_LABELS[feedbackType!]}] ${firstLine}` : firstLine).slice(0, 120)
  const contactAddress = useRuntimeConfig().inboxContactAddress || 'contact@doxa.life'
  const conversation = await conversationService.create({
    subscriber_id: subscriber.id,
    subject,
    status: 'open',
    source: isFeedback ? 'feedback' : 'contact_form',
  })

  // Filterable, colour-coded inbox tag for the feedback type (palette seeded at startup).
  if (isFeedback) {
    await conversationService.setTags(conversation.id, [`feedback-${feedbackType}`])
  }

  // Log creation before the first message is inserted, so the conversation keeps a full
  // origin trail (source + the address it arrived on) even if the message step fails.
  logCreate('conversations', String(conversation.id), event, {
    message: isFeedback ? 'Feedback conversation opened' : 'Contact form conversation opened',
    source: isFeedback ? 'feedback' : 'contact_form',
    received_on: contactAddress,
    direction: 'inbound',
  })
  // Append a device-info block (feedback only) so staff see the diagnostic
  // context inline in the inbox and in reply emails.
  const deviceInfo = isFeedback && input.device ? renderDeviceInfo(input.device) : null
  const bodyText = deviceInfo ? `${message}\n${deviceInfo.text}` : message
  const bodyHtml = `<p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>${deviceInfo ? deviceInfo.html : ''}`

  const firstMessage = await messageService.create({
    conversation_id: conversation.id,
    direction: 'inbound',
    status: 'received',
    from_email: email,
    from_name: name || email,
    to_email: contactAddress,
    subject,
    body_html: bodyHtml,
    body_text: bodyText,
  })
  await conversationService.touchLastMessage(conversation.id, firstMessage.created_at, 'inbound')

  // Auto-ack (in the form's language) and the staff notification go through the job
  // queue so a transient send failure is retried instead of silently lost.
  try {
    await jobQueueService.createJob<InboxEmailPayload>('inbox_email', {
      kind: 'auto_ack',
      conversation_id: conversation.id,
      to: email,
      name: name || null,
      language,
    }, { referenceType: 'conversation', referenceId: conversation.id })
    await jobQueueService.createJob<InboxEmailPayload>('inbox_email', {
      kind: 'new_conversation',
      conversation_id: conversation.id,
      message_id: firstMessage.id,
    }, { referenceType: 'conversation', referenceId: conversation.id })
  } catch (err) {
    console.error('Failed to enqueue inbox emails:', err)
  }

  trackEventInBackground(event, {
    eventType: isFeedback ? 'feedback_form_submitted' : 'contact_form_submitted',
    anonymousHash: subscriber.tracking_id,
    userHash: userHashFromEmail(email),
    language,
    metadata: {
      source: isFeedback ? 'feedback' : 'contact_form',
      country,
      consent_doxa_general: input.consentDoxaGeneral ?? false,
      language,
      ...(isFeedback ? { feedback_type: feedbackType } : {}),
      ...(isFeedback && input.device && Object.keys(input.device).length > 0
        ? { device: input.device }
        : {}),
    },
  })
}
