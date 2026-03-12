import { followupTrackingService } from '../database/followup-tracking'
import { peopleGroupSubscriptionService } from '../database/people-group-subscriptions'
import { sendFollowupEmail } from '../utils/followup-email'

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000
const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000

export default defineNitroPlugin((nitroApp) => {
  if (process.env.VITEST) return

  const enableFollowups = process.env.ENABLE_FOLLOWUP_EMAILS !== 'false'

  if (!enableFollowups) {
    console.log('⏸️  Follow-up emails disabled')
    console.log('   Set ENABLE_FOLLOWUP_EMAILS=true to enable')
    return
  }

  console.log('📧 Scheduling follow-up check-in emails (checking every hour)')

  let isProcessing = false

  // Check every hour
  const interval = setInterval(async () => {
    if (isProcessing) {
      return
    }

    isProcessing = true

    try {
      await processFollowups()
    } catch (error: any) {
      console.error('❌ Follow-up scheduler error:', error.message)
    } finally {
      isProcessing = false
    }
  }, 60 * 60 * 1000) // 1 hour

  // Also run 30 seconds after startup
  setTimeout(async () => {
    if (!isProcessing) {
      isProcessing = true
      try {
        await processFollowups()
      } catch (error: any) {
        console.error('❌ Initial follow-up check error:', error.message)
      } finally {
        isProcessing = false
      }
    }
  }, 30000)

  console.log('✅ Follow-up scheduler initialized')

  nitroApp.hooks.hook('close', () => {
    console.log('🛑 Stopping follow-up scheduler...')
    clearInterval(interval)
  })
})

async function claimFollowupLock(hourKey: string): Promise<boolean> {
  const lockKey = `followup-scheduler:${hourKey}`
  const [row] = await sql`
    INSERT INTO activity_logs (id, timestamp, event_type, metadata)
    VALUES (
      md5(${lockKey})::uuid,
      ${Date.now()},
      'FOLLOWUP_SCHEDULER_LOCK',
      ${{ hourKey }}
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `
  return !!row
}

async function processFollowups() {
  const now = new Date()
  const hourKey = now.toISOString().slice(0, 13) // YYYY-MM-DDTHH
  if (!await claimFollowupLock(hourKey)) return

  // Get all active subscriptions with their activity data
  const subscriptions = await followupTrackingService.getActiveSubscriptionsForFollowup()

  if (subscriptions.length === 0) {
    return
  }

  let processedCount = 0
  let emailsSent = 0
  let markedInactive = 0
  let cyclesCompleted = 0

  for (const subscription of subscriptions) {
    try {
      const result = await processSubscription(subscription, now)
      processedCount++

      if (result === 'email_sent') emailsSent++
      else if (result === 'marked_inactive') markedInactive++
      else if (result === 'cycle_completed') cyclesCompleted++
    } catch (error: any) {
      console.error(`  ❌ Error processing subscription ${subscription.id}:`, error.message)
    }
  }

  if (emailsSent > 0 || markedInactive > 0 || cyclesCompleted > 0) {
    console.log(`📧 Follow-up processing complete: ${emailsSent} emails sent, ${cyclesCompleted} cycles completed, ${markedInactive} marked inactive`)
  }
}

type ProcessResult = 'skipped' | 'email_sent' | 'marked_inactive' | 'cycle_completed'

async function processSubscription(
  subscription: Awaited<ReturnType<typeof followupTrackingService.getActiveSubscriptionsForFollowup>>[0],
  now: Date
): Promise<ProcessResult> {
  const {
    id: subscriptionId,
    followup_count,
    followup_reminder_count,
    last_followup_at,
    last_activity_at,
    created_at,
    subscriber_name,
    email_value,
    people_group_name,
    people_group_slug,
    frequency,
    days_of_week,
    subscriber_profile_id,
    subscriber_language
  } = subscription

  // Calculate when the next followup is due
  const baseTimestamp = last_activity_at || created_at
  const baseDate = new Date(baseTimestamp)
  const intervalMs = followup_count === 0 ? ONE_MONTH_MS : THREE_MONTHS_MS
  const dueAt = new Date(baseDate.getTime() + intervalMs)

  // Not due yet
  if (dueAt > now) {
    return 'skipped'
  }

  // Check for activity since last followup was sent
  if (last_followup_at) {
    const hasActivitySince = await followupTrackingService.hasActivitySinceLastFollowup(subscriptionId)

    if (hasActivitySince) {
      // Activity detected! Complete the cycle and skip sending email
      await peopleGroupSubscriptionService.completeFollowupCycle(subscriptionId)
      console.log(`  ✅ Activity detected for ${email_value}, follow-up cycle completed`)
      return 'cycle_completed'
    }
  }

  // No recent activity and follow-up is due - handle based on reminder count
  if (followup_reminder_count === 0) {
    // Send initial follow-up email
    const emailSent = await sendFollowupEmail({
      to: email_value,
      subscriberName: subscriber_name,
      peopleGroupName: people_group_name,
      peopleGroupSlug: people_group_slug,
      subscriptionId,
      profileId: subscriber_profile_id,
      frequency,
      daysOfWeek: days_of_week ? JSON.parse(days_of_week) : undefined,
      isReminder: false,
      locale: subscriber_language || 'en'
    })

    if (emailSent) {
      await peopleGroupSubscriptionService.markFollowupSent(subscriptionId)
      console.log(`  ✅ Sent follow-up to ${email_value} for ${people_group_name}`)
      return 'email_sent'
    } else {
      console.error(`  ❌ Failed to send follow-up to ${email_value}`)
      return 'skipped'
    }
  } else if (followup_reminder_count === 1) {
    // Check if 1 week has passed since last followup
    const lastFollowupDate = new Date(last_followup_at!)
    const weekAfterFollowup = new Date(lastFollowupDate.getTime() + ONE_WEEK_MS)

    if (now < weekAfterFollowup) {
      return 'skipped' // Not time for reminder yet
    }

    // Send reminder email
    const emailSent = await sendFollowupEmail({
      to: email_value,
      subscriberName: subscriber_name,
      peopleGroupName: people_group_name,
      peopleGroupSlug: people_group_slug,
      subscriptionId,
      profileId: subscriber_profile_id,
      frequency,
      daysOfWeek: days_of_week ? JSON.parse(days_of_week) : undefined,
      isReminder: true,
      locale: subscriber_language || 'en'
    })

    if (emailSent) {
      await peopleGroupSubscriptionService.markFollowupSent(subscriptionId)
      console.log(`  ✅ Sent follow-up reminder to ${email_value} for ${people_group_name}`)
      return 'email_sent'
    } else {
      console.error(`  ❌ Failed to send follow-up reminder to ${email_value}`)
      return 'skipped'
    }
  } else {
    // followup_reminder_count >= 2: check if another week has passed
    const lastFollowupDate = new Date(last_followup_at!)
    const weekAfterFollowup = new Date(lastFollowupDate.getTime() + ONE_WEEK_MS)

    if (now < weekAfterFollowup) {
      return 'skipped' // Not time to mark inactive yet
    }

    // No response after 2 emails - mark as inactive
    await peopleGroupSubscriptionService.updateStatus(subscriptionId, 'inactive')
    console.log(`  ⏸️  Marked ${email_value} as inactive (no follow-up response)`)
    return 'marked_inactive'
  }
}
