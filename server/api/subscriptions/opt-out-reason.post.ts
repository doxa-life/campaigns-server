/**
 * POST /api/subscriptions/opt-out-reason
 * Record why a subscriber muted or stopped one or more prayer times.
 *
 * Always a follow-up to the opt-out itself, never a precondition for it: the stop
 * has already been saved by the time this is called, so answering stays optional
 * and a failure here can never leave someone still subscribed against their wish.
 *
 * Authenticated by profile_id, the same self-service token the stop endpoints use,
 * and every id is checked against that subscriber before anything is written.
 */
import { subscriberService } from '#server/database/subscribers'
import { peopleGroupSubscriptionService } from '#server/database/people-group-subscriptions'
import { peopleGroupService } from '#server/database/people-groups'
import { trackEventInBackground } from '#server/utils/tracking'
import { isOptOutReasonKey, OPT_OUT_REASON_TEXT_MAX } from '../../../config/opt-out-reasons'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const profileId = body.profile_id as string
  const reason = body.reason
  const reasonText = typeof body.reason_text === 'string' ? body.reason_text : null
  const subscriptionIds: unknown = body.subscription_ids

  if (!profileId) {
    throw createError({ statusCode: 400, statusMessage: 'Profile ID is required' })
  }
  if (!isOptOutReasonKey(reason)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid reason' })
  }
  if (!Array.isArray(subscriptionIds) || subscriptionIds.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'At least one subscription id is required' })
  }

  const ids = subscriptionIds.map(Number).filter(id => Number.isInteger(id) && id > 0)
  if (ids.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'At least one subscription id is required' })
  }
  if (reasonText && reasonText.trim().length > OPT_OUT_REASON_TEXT_MAX) {
    throw createError({
      statusCode: 400,
      statusMessage: `Reason text must be ${OPT_OUT_REASON_TEXT_MAX} characters or fewer`
    })
  }

  const subscriber = await subscriberService.getSubscriberByProfileId(profileId)
  if (!subscriber) {
    throw createError({ statusCode: 404, statusMessage: 'Subscriber not found' })
  }

  // Free text belongs to the 'other' option; a stray note on a fixed choice would
  // never be shown next to it, so it is dropped rather than silently stored.
  const text = reason === 'other' ? reasonText : null

  const updatedIds = await peopleGroupSubscriptionService.recordOptOutReason(
    subscriber.id,
    ids,
    reason,
    text
  )

  if (updatedIds.length === 0) {
    throw createError({ statusCode: 403, statusMessage: 'You do not have permission to change these reminders' })
  }

  // Named on the record by the people group the reminders belong to, so the history
  // entry reads the same way as the stop entry that precedes it.
  const first = await peopleGroupSubscriptionService.getById(updatedIds[0]!)
  const peopleGroup = first ? await peopleGroupService.getPeopleGroupById(first.people_group_id) : null

  logCreate('subscribers', String(subscriber.id), event, {
    source: 'self_service',
    badge: 'Stop Reason',
    message: 'Gave a reason for stopping',
    link_text: peopleGroup?.name,
    link_url: peopleGroup ? `/admin/people-groups/${peopleGroup.id}` : undefined,
    form_values: {
      opt_out_reason: reason,
      ...(text ? { opt_out_reason_text: text } : {}),
      reminders: updatedIds.length
    }
  })

  trackEventInBackground(event, {
    eventType: 'opt_out_reason',
    anonymousHash: subscriber.tracking_id,
    language: subscriber.preferred_language || null,
    metadata: {
      reason,
      subscription_ids: updatedIds,
      people_group_slug: peopleGroup?.slug || null,
      people_group_id: peopleGroup?.id || null
    }
  })

  return {
    success: true,
    reason,
    subscription_ids: updatedIds
  }
})
