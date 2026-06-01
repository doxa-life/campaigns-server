# Notifications System

## Overview

The notifications system sends prayer reminders to subscribers at their preferred times. Subscribers choose when and how often they want to be reminded to pray, and the system delivers those reminders reliably while respecting their timezone.

Reminders are considered transactional emails since they fulfill a specific service the user requested. Marketing communications are handled separately through the consent system.

## How Users Sign Up

Users sign up for reminders through a people-group-specific signup form. They provide:

**Name** - Used to personalize reminder emails.

**Email** - Where reminders will be sent. Must be verified before reminders begin.

**Frequency** - Either daily or weekly. Weekly subscribers choose which days of the week.

**Time** - What time they want to receive their reminder (in their local timezone).

**Timezone** - Automatically detected but can be changed. The system converts their preferred time to UTC for scheduling.

**Prayer Duration** - How long they intend to pray (5, 10, 15, 30, or 60 minutes). This is shown in the reminder email.

Users can have up to 5 active reminders per people group, allowing different schedules for different days or times.

## Email Verification

Before any reminders are sent, users must verify their email address. When someone signs up:

1. The system creates their subscription in a pending state
2. A verification email is sent with a unique link
3. The link expires after 7 days
4. Once clicked, the email is marked verified and a welcome email is sent
5. The first reminder is scheduled based on their preferences

If a returning subscriber signs up with an already-verified email, verification is skipped and the welcome email is sent immediately.

This verification step ensures we never send unsolicited emails and helps maintain good email deliverability.

## How Reminders Are Scheduled

Each subscription stores a `next_reminder_utc` timestamp representing when the next reminder should be sent, converted to UTC from the user's local time.

**For daily reminders**: If the preferred time has already passed today, the first reminder is scheduled for tomorrow. After each reminder, the next one is scheduled for the following day.

**For weekly reminders**: The system finds the next matching day from their selected days of the week. If today is a matching day but the time has passed, it finds the next matching day.

The scheduler recalculates `next_reminder_utc` after every sent reminder, accounting for the user's timezone correctly.

## The Reminder Scheduler

A background process runs every minute checking for reminders that are due. It:

1. Queries all active subscriptions where `next_reminder_utc` is in the past
2. Groups them by people group to efficiently fetch prayer content
3. Sends each reminder email
4. Records the send in the tracking table
5. Calculates and updates the next scheduled time

The scheduler includes several safety measures:

**Duplicate prevention** - Before sending, it checks if a reminder was already sent today for this subscription. If so, it updates the next scheduled time but skips sending.

**Overlap prevention** - A flag prevents multiple scheduler runs from overlapping, avoiding duplicate sends during slow processing.

**Verified only** - Only sends to subscriptions with verified email addresses.

**Status check** - Only sends to active subscriptions (not unsubscribed).

## What's In a Reminder Email

Each reminder email includes:

- Personalized greeting with the subscriber's name
- The people group title
- Their chosen prayer duration ("It's time for your 15-minute prayer session")
- A button linking to the people group's prayer content
- Links to manage preferences or unsubscribe

If the campaign has prayer content for the day (written in the Tiptap editor), it can be converted to HTML and included in the email.

## Tracking Sent Reminders

Every sent reminder is logged in the `reminder_emails_sent` table with:

- The subscription ID
- The date it was sent (YYYY-MM-DD format)
- The exact timestamp

This serves two purposes: preventing duplicate sends on the same day, and providing an audit trail. Admins can view the last 50 sent reminders for any subscription through the admin interface.

## How Users Manage Their Reminders

**Profile Page** - Accessible via a personalized link in their emails, users can:
- View all their subscriptions across people groups
- Update their name or email (email change triggers re-verification)
- Modify any subscription's frequency, time, timezone, or prayer duration
- Delete individual subscriptions

**Unsubscribe Page** - When clicking unsubscribe in an email:
- They see all their active reminders
- They can unsubscribe from a single reminder or all reminders in that people group
- They can immediately resubscribe if they change their mind
- They see other people groups they're still subscribed to

## Subscriber Data Architecture

The system uses a normalized data structure:

**Subscribers** - The person, identified by tracking ID (for analytics) and profile ID (for self-service management).

**Contact Methods** - Email addresses and phone numbers linked to subscribers. Each has its own verification status and consent settings.

**People Group Subscriptions** - The actual reminder schedules, linking a subscriber to a people group with specific delivery preferences.

This separation allows:
- One person to have multiple email addresses with different settings
- One email address to have multiple reminders across people groups
- Efficient deduplication when the same person signs up multiple times

## Admin Capabilities

Administrators can:

- View all subscriptions for any people group with filtering and pagination
- See a subscriber's complete email history
- View activity logs showing preference changes
- Manually trigger a reminder send for testing or customer support

## Design Decisions

**UTC storage** - All scheduled times are stored in UTC. The conversion from user's local time happens when calculating next send. This avoids timezone complexity in the scheduler and handles daylight saving changes correctly.

**1-minute granularity** - The scheduler runs every minute, so reminders may arrive up to 1 minute after the requested time. This provides near-real-time delivery while keeping the system simple.

**Date-based duplicate prevention** - We track sends by date, not exact time. This means if the scheduler fails and recovers, it won't send duplicate reminders for the same day.

**Max 5 subscriptions per people group** - This limit prevents abuse while allowing legitimate use cases like different schedules for different days.

**Soft unsubscribe** - Unsubscribing sets a status flag rather than deleting data. This allows users to resubscribe with their original preferences intact.

## Current Limitations

- Only email delivery is fully implemented (WhatsApp and app notifications are tracked but not sent)
- Reminder emails cannot be customized per people group
- No batch send analytics or delivery rate tracking
- The scheduler does not retry failed sends
