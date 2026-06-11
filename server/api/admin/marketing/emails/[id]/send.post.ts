import { marketingEmailService } from '#server/database/marketing-emails'
import { marketingSenderService } from '#server/database/marketing-senders'
import { jobQueueService } from '#server/database/job-queue'
import { contactMethodService } from '#server/database/contact-methods'
import { getSql } from '#server/database/db'
import { handleApiError } from '#server/utils/api-helpers'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'marketing.send')

  const id = Number(getRouterParam(event, 'id'))
  if (!id || isNaN(id)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid email ID'
    })
  }

  const canAccess = await marketingEmailService.canUserAccessEmail(user.userId, id)
  if (!canAccess) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Email not found'
    })
  }

  const email = await marketingEmailService.getById(id)
  if (!email) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Email not found'
    })
  }

  if (email.status !== 'draft') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Only drafts can be sent'
    })
  }

  // No default sender: when more than one sender is configured the From must be
  // chosen explicitly. A single configured sender is resolved automatically at send.
  if (!email.sender_id) {
    const senders = await marketingSenderService.list()
    if (senders.length > 1) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Select a From sender before sending'
      })
    }
  }

  const canSend = await marketingEmailService.canUserSendToAudience(
    user.userId,
    email.audience_type,
    email.people_group_id ?? undefined
  )

  if (!canSend) {
    throw createError({
      statusCode: 403,
      statusMessage: email.audience_type === 'doxa'
        ? 'Only admins can send Doxa-wide emails'
        : 'You do not have access to this people group'
    })
  }

  let recipients: Array<{ id: number; value: string }>

  if (email.audience_type === 'doxa') {
    const contacts = await contactMethodService.getContactsWithDoxaConsent()
    recipients = contacts.map(c => ({ id: c.id, value: c.value }))
  } else if (email.audience_type === 'doxa_active_pg') {
    const contacts = await contactMethodService.getContactsWithDoxaConsentAndActiveSubscription()
    recipients = contacts.map(c => ({ id: c.id, value: c.value }))
  } else if (email.audience_type === 'active_pg') {
    const contacts = await contactMethodService.getContactsWithActiveSubscription()
    recipients = contacts.map(c => ({ id: c.id, value: c.value }))
  } else if (email.audience_type === 'pick') {
    const contacts = await contactMethodService.getEmailContactsByIds(email.recipient_contact_method_ids ?? [])
    recipients = contacts.map(c => ({ id: c.id, value: c.value }))
  } else if (email.audience_type === 'admins') {
    recipients = await marketingEmailService.getAdminRecipients()
  } else if (email.people_group_id) {
    const contacts = await contactMethodService.getContactsConsentedToPeopleGroup(email.people_group_id)
    recipients = contacts.map(c => ({ id: c.id, value: c.value }))
  } else {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid audience configuration'
    })
  }

  if (recipients.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No recipients found for this audience'
    })
  }

  const sql = getSql()
  let claimed = false
  let queuedCount = 0

  try {
    // Claim + enqueue atomically. The conditional draft->queued update and the job
    // inserts commit together: a crash mid-enqueue rolls the whole thing back (no
    // orphan jobs, no email wedged in 'queued'), and a concurrent duplicate send
    // loses the claim — its UPDATE matches no row — so the audience is never enqueued
    // twice. The unique index on jobs is a final backstop inside createMarketingEmailJobs.
    await sql.begin(async (tx) => {
      claimed = await marketingEmailService.claimDraftForSend(id, recipients.length, user.userId, tx)
      if (!claimed) return
      queuedCount = await jobQueueService.createMarketingEmailJobs(id, recipients, tx)
    })
  } catch (error) {
    handleApiError(error, 'Failed to queue email')
  }

  if (!claimed) {
    throw createError({
      statusCode: 409,
      statusMessage: 'This email is already being sent'
    })
  }

  return {
    success: true,
    message: `Email queued for ${queuedCount} recipients`,
    recipient_count: queuedCount
  }
})
