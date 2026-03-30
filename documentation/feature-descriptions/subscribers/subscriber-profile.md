# Subscriber Profile Page

## Overview

The profile page is where subscribers manage their account settings, communication preferences, and reminder schedules. It's a self-service page that subscribers can access without logging in—they just need the unique link from their email.

## Accessing the Profile

Every subscriber has a unique profile link that looks like `/subscriber?id=abc123`. This link appears in:

- Welcome emails after signup
- Reminder emails (as a "Manage Preferences" link)
- The unsubscribe page

Because the link contains a unique ID, subscribers don't need to log in. Anyone with the link can access that profile, so we only share it through emails sent to the subscriber.

## What Subscribers Can Do

### Update Account Information

Subscribers can change their name and email address. If they change their email:

- The new address must be verified before reminders resume
- A verification email is sent automatically
- The page shows a warning until verification is complete
- The old email stops receiving reminders immediately

The system prevents two subscribers from using the same email address.

### Manage Communication Preferences

The profile shows toggles for marketing consent:

**Doxa Updates** - Whether to receive general updates about Doxa's work across all people groups.

**People Group Updates** - For each people group they're subscribed to, whether to receive news and announcements from that people group's organizers.

These toggles save immediately when clicked. They're separate from prayer reminders—unsubscribing from marketing doesn't affect reminder delivery.

### View and Edit Reminders

All active reminders are grouped by people group. For each reminder, subscribers see:

- Whether it's daily or weekly
- Which days (for weekly reminders)
- What time reminders arrive
- Their timezone
- Their chosen prayer duration

Clicking "Edit" on any reminder opens a form to change these settings. Changes save when clicking "Save Changes" or are discarded with "Cancel."

### Delete Reminders

Subscribers can permanently delete any active reminder. This removes the reminder entirely—to restore it, they'd need to sign up again through the people group page.

### Re-subscribe to Previous Reminders

If a subscriber previously unsubscribed from a reminder, it still appears on their profile but grayed out with an "Unsubscribed" badge. They can click "Re-subscribe" to reactivate it with their original settings.

This is different from deletion—unsubscribed reminders are paused, not removed.

### Add to Calendar

Active reminders include calendar links — subscribers can add their prayer schedule to Google Calendar or download an ICS file for other calendar apps (Apple Calendar, Outlook, etc.). This creates calendar events matching their reminder frequency, time, and duration.

### Navigate to Campaigns

Each people group section includes a "View Campaign" link that goes to the people group's public prayer page. This helps subscribers who want to pray outside their scheduled times.

## How Settings Are Organized

**Account-level settings** (name, email) apply everywhere.

**Contact-level settings** (marketing consent) are tied to the email address. If someone has verified multiple email addresses, each has its own consent settings.

**Subscription-level settings** (frequency, time, timezone, duration) are specific to each reminder. A subscriber can have different settings for different reminders, even within the same people group.

## Design Decisions

**No login required** - Subscribers access their profile through a unique link rather than creating an account. This reduces friction for people who just want to adjust their reminders.

**Unique link as authentication** - The profile ID in the URL acts as a credential. We only expose this ID in emails sent to the subscriber, so only they should have access.

**Email verification on change** - When someone changes their email, we verify the new address before sending reminders there. This prevents accidental delivery to wrong addresses and confirms the subscriber controls the new email.

**Inline editing** - Rather than navigating to separate pages, all reminder editing happens in place. This keeps the interface simple and lets subscribers see all their reminders at once.

**Unsubscribed reminders remain visible** - When someone unsubscribes, we keep the reminder on their profile so they can easily reactivate it. Deletion is a separate, permanent action.

## Current Limitations

- No way to add new reminders from the profile page (must use the people group signup form)
- Cannot change which people group a reminder is for
- No history of when settings were changed
- Email address cannot be removed, only changed
