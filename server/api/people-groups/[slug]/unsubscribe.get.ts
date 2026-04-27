/**
 * GET /api/people-groups/:slug/unsubscribe
 * Get subscriber info and unsubscribe from people group reminders
 */
import { peopleGroupService } from '#server/database/people-groups'
import { subscriberService } from '#server/database/subscribers'
import { peopleGroupSubscriptionService } from '#server/database/people-group-subscriptions'
import { trackEventInBackground } from '#server/utils/tracking'

interface ReminderInfo {
  id: number
  frequency: string
  days_of_week: number[]
  time_preference: string
  timezone: string
}

interface PeopleGroupInfo {
  id: number
  title: string
  slug: string
  reminders: ReminderInfo[]
}

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  const query = getQuery(event)
  const profileId = query.id as string
  const subscriptionId = query.sid ? Number(query.sid) : null
  // unsubscribe_all flag to unsubscribe from entire people group
  const unsubscribeAll = query.all === 'true'

  if (!slug) {
    throw createError({
      statusCode: 400,
      statusMessage: 'People group slug is required'
    })
  }

  if (!profileId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Profile ID is required'
    })
  }

  // Verify the people group exists
  const peopleGroup = await peopleGroupService.getPeopleGroupBySlug(slug)

  if (!peopleGroup) {
    throw createError({
      statusCode: 404,
      statusMessage: 'People group not found'
    })
  }

  // Get the subscriber by profile ID
  const subscriber = await subscriberService.getSubscriberByProfileId(profileId)

  if (!subscriber) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Subscription not found'
    })
  }

  // Get ALL subscriptions for this subscriber (across all people groups)
  const allSubscriberSubscriptions = await peopleGroupSubscriptionService.getSubscriberSubscriptions(subscriber.id)

  // Get subscriptions for this specific people group
  const peopleGroupSubscriptions = allSubscriberSubscriptions.filter(s => s.people_group_id === peopleGroup.id)

  if (peopleGroupSubscriptions.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'You are not subscribed to this people group'
    })
  }

  // Helper to format reminder
  const formatReminder = (s: typeof peopleGroupSubscriptions[0]): ReminderInfo => ({
    id: s.id,
    frequency: s.frequency,
    days_of_week: s.days_of_week,
    time_preference: s.time_preference,
    timezone: s.timezone
  })

  // Helper to group subscriptions by people group
  const groupByPeopleGroup = (subs: typeof allSubscriberSubscriptions): PeopleGroupInfo[] => {
    const peopleGroupMap = new Map<number, PeopleGroupInfo>()

    for (const sub of subs) {
      if (sub.status !== 'active') continue

      if (!peopleGroupMap.has(sub.people_group_id)) {
        peopleGroupMap.set(sub.people_group_id, {
          id: sub.people_group_id,
          title: sub.people_group_name,
          slug: sub.people_group_slug,
          reminders: []
        })
      }
      peopleGroupMap.get(sub.people_group_id)!.reminders.push(formatReminder(sub))
    }

    return Array.from(peopleGroupMap.values())
  }

  const trackUnsubscribe = (alreadyUnsubscribed: boolean, trackedSubscriptionId: number | null) => {
    trackEventInBackground(event, {
      eventType: 'subscriber_unsubscribed',
      anonymousHash: subscriber.tracking_id,
      language: subscriber.preferred_language || null,
      metadata: {
        people_group_slug: slug,
        people_group_id: peopleGroup.id,
        subscription_id: trackedSubscriptionId,
        unsubscribe_all: unsubscribeAll,
        already_unsubscribed: alreadyUnsubscribed
      }
    })
  }

  // If unsubscribe_all flag is set, unsubscribe from entire people group
  if (unsubscribeAll) {
    const unsubscribedCount = await peopleGroupSubscriptionService.unsubscribeAllForPeopleGroup(
      subscriber.id,
      peopleGroup.id
    )

    // Get other people groups (excluding current one)
    const otherPeopleGroups = groupByPeopleGroup(
      allSubscriberSubscriptions.filter(s => s.people_group_id !== peopleGroup.id)
    )

    trackUnsubscribe(false, null)

    return {
      message: `Unsubscribed from all ${unsubscribedCount} reminder(s) for this people group`,
      already_unsubscribed: false,
      unsubscribed_from_people_group: true,
      people_group: {
        id: peopleGroup.id,
        title: peopleGroup.name,
        slug: slug
      },
      unsubscribed_reminder: null,
      other_reminders_in_people_group: [],
      other_people_groups: otherPeopleGroups
    }
  }

  // Find the specific subscription to unsubscribe
  let subscriptionToUnsubscribe = subscriptionId
    ? peopleGroupSubscriptions.find(s => s.id === subscriptionId)
    : peopleGroupSubscriptions.find(s => s.status === 'active')

  // Get other people groups (excluding current one)
  const otherPeopleGroups = groupByPeopleGroup(
    allSubscriberSubscriptions.filter(s => s.people_group_id !== peopleGroup.id)
  )

  if (!subscriptionToUnsubscribe) {
    const otherRemindersInPeopleGroup = peopleGroupSubscriptions
      .filter(s => s.status === 'active')
      .map(formatReminder)

    trackUnsubscribe(true, subscriptionId)

    return {
      message: 'You have already been unsubscribed',
      already_unsubscribed: true,
      unsubscribed_from_people_group: false,
      people_group: {
        id: peopleGroup.id,
        title: peopleGroup.name,
        slug: slug
      },
      unsubscribed_reminder: null,
      other_reminders_in_people_group: otherRemindersInPeopleGroup,
      other_people_groups: otherPeopleGroups
    }
  }

  // Check if this specific subscription is already unsubscribed
  if (subscriptionToUnsubscribe.status === 'unsubscribed') {
    const otherRemindersInPeopleGroup = peopleGroupSubscriptions
      .filter(s => s.id !== subscriptionToUnsubscribe!.id && s.status === 'active')
      .map(formatReminder)

    trackUnsubscribe(true, subscriptionToUnsubscribe.id)

    return {
      message: 'You have already been unsubscribed from this reminder',
      already_unsubscribed: true,
      unsubscribed_from_people_group: false,
      people_group: {
        id: peopleGroup.id,
        title: peopleGroup.name,
        slug: slug
      },
      unsubscribed_reminder: formatReminder(subscriptionToUnsubscribe),
      other_reminders_in_people_group: otherRemindersInPeopleGroup,
      other_people_groups: otherPeopleGroups
    }
  }

  // Unsubscribe from this specific reminder
  const result = await peopleGroupSubscriptionService.unsubscribe(subscriptionToUnsubscribe.id)

  if (!result) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to unsubscribe'
    })
  }

  // Get remaining active reminders in this people group
  const otherRemindersInPeopleGroup = peopleGroupSubscriptions
    .filter(s => s.id !== subscriptionToUnsubscribe!.id && s.status === 'active')
    .map(formatReminder)

  trackUnsubscribe(false, subscriptionToUnsubscribe.id)

  return {
    success: true,
    message: 'Successfully unsubscribed from this reminder',
    already_unsubscribed: false,
    unsubscribed_from_people_group: false,
    people_group: {
      id: peopleGroup.id,
      title: peopleGroup.name,
      slug: slug
    },
    unsubscribed_reminder: formatReminder(subscriptionToUnsubscribe),
    other_reminders_in_people_group: otherRemindersInPeopleGroup,
    other_people_groups: otherPeopleGroups
  }
})
