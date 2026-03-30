# Commitment Follow-Up Emails

This system periodically checks in with subscribers to see if they're still actively praying, and pauses notifications for those who aren't responding.

## What it does

When someone signs up for prayer reminders, they commit to praying on a schedule. Over time, some people may stop praying but continue receiving emails they no longer want. This feature helps us:

1. Check in with subscribers to see how their prayer journey is going
2. Identify people who may want to adjust their schedule
3. Automatically pause reminders for people who aren't engaging

## How it works

### Timing

- **First check-in**: Sent 1 month after signup (or after their last prayer session)
- **Follow-up check-ins**: Sent every 3 months after that

The system tracks prayer activity automatically. If someone clicks through from a reminder email and logs a prayer session, that resets their check-in timer.

### The check-in email

Subscribers receive an email asking how their prayer commitment is going. The question adapts to their schedule:

- Daily subscribers see: "Are you still praying daily?"
- Weekly subscribers see: "Are you still praying on [their scheduled days]?"

They can respond with one of three options:
- **Yes** - They're keeping up with their commitment
- **Sometimes** - They're praying, but not as often as planned
- **No, no longer praying** - They want to pause their reminders

### What happens after they respond

**Yes** - We thank them for their commitment. Next check-in scheduled in 3 months.

**Sometimes** - We thank them and suggest adjusting their schedule, with a link to their preferences. Next check-in in 3 months.

**No longer praying** - We let them know their reminders are paused. They can reactivate anytime from their profile.

### If they don't respond

The email includes a note that if we don't hear back, we'll pause their reminders to avoid filling their inbox.

The escalation process:
1. Initial check-in email sent
2. If no response after 1 week, a reminder email is sent
3. If still no response 1 week after the reminder, automatically pause their subscription (roughly 2 weeks total from the initial check-in)

Subscribers can always reactivate from their profile page.

## Key decisions

**Why check activity instead of just sending on a schedule?**
If someone is actively praying (clicking through emails and logging sessions), they're clearly engaged. Sending them a "are you still praying?" email would be annoying. We only check in when we haven't seen activity.

**Why pause instead of unsubscribe?**
Pausing (marking as "inactive") is gentler than unsubscribing. It means they won't get reminders, but they can easily come back. When they reactivate, everything resets and they start fresh.

**Why different intervals for first vs. subsequent check-ins?**
New subscribers get a shorter grace period (1 month) because early engagement is a good predictor of long-term commitment. After they've confirmed once, we trust them more and wait 3 months.

## Current limitations

- Only works for email subscriptions (not WhatsApp or app notifications)
- The check-in timing is based on calendar time, not on their actual prayer schedule (e.g., someone who prays weekly still gets checked monthly/quarterly, not after X missed sessions)
- Admins can manually send a check-in email from the subscriber detail page, but there's no bulk option

## Admin features

From the subscriber detail page in the admin panel, staff can:
- See a subscriber's prayer activity history
- Manually send a check-in email using the "Send Follow-up" button
- View and change a subscriber's status (active/inactive)
