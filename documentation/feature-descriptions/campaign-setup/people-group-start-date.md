# People Group Start Date

## Overview

All prayer people groups share a global start date that determines when prayer content begins. This date is configured by administrators and affects what users see on people group pages and when they receive their first reminder.

Before the start date, users can sign up for prayer reminders, but no reminders are sent and no prayer content is available. This allows people groups to build momentum before launch while giving subscribers a clear expectation of when prayer will begin.

## How Users Experience It

### People Group Landing Page

When visiting a people group before the start date, users see an informational alert in the signup section:

> **Prayer begins on [date]**

The date is displayed in the user's local format (e.g., "Sunday, March 1, 2026" for English speakers). Users can still complete the signup process, choosing their preferred reminder time, frequency, and other preferences.

### Prayer Content Page

When visiting the prayer content page before the start date, users see a centered message instead of the normal content:

> **Prayer Content Coming Soon**
>
> Daily prayer content will begin on [date]. Sign up now to receive reminders when it starts!

A button links back to the people group signup page. The normal "past prayer content" section is hidden since there is no past content yet.

### Reminder Emails

No reminder emails are sent before the start date, regardless of when a user signed up or what time they selected for reminders.

**For users who sign up before the start date**: Their first reminder is scheduled for the start date at their preferred time in their timezone. For example, if someone in Los Angeles signs up for 9am reminders and the start date is March 1, their first reminder will be March 1 at 9am Pacific time.

**For weekly subscribers**: If their selected days don't include the start date, their first reminder is scheduled for the first matching day after the start date. For example, if the start date is Monday March 1 and a user selects Wednesday and Friday, their first reminder will be Wednesday March 3.

## Changing the Start Date

Administrators can change the global start date at any time through the Prayer Fuel Order page. This affects all people groups immediately:

**If the start date is moved later**: Users who already signed up will not receive reminders until the new date. The system checks the current start date each time it processes reminders, so this change takes effect immediately without needing to update individual subscriptions.

**If the start date is moved earlier**: Users may receive their first reminder sooner than expected, but no earlier than their scheduled time on the new start date.

**If the people group has already started**: Moving the start date to a future date will pause all reminders until that date arrives. Moving it to an earlier date has no effect since content is already flowing.

## Timezone Handling

The start date is interpreted in each user's local timezone:

- A user in New Zealand (UTC+13) will start receiving reminders when it becomes the start date in New Zealand
- A user in Los Angeles (UTC-8) will start receiving reminders when it becomes the start date in Los Angeles
- This means New Zealand users start about 21 hours before Los Angeles users

This approach ensures that "March 1" means March 1 for everyone, regardless of where they live.

## Design Decisions

**Global start date rather than per-people group**: All people groups share one start date because they share the same prayer content library. Having different start dates per people group would create complexity around which content to show and would confuse users who subscribe to multiple people groups.

**Users can sign up before launch**: This allows people groups to promote signups before content is ready, building a subscriber base for launch day. The alternative of hiding the signup form would limit marketing opportunities.

**Scheduled at user's preferred time, not midnight**: When a user signs up for 9am reminders, their first reminder on the start date arrives at 9am, not midnight. This respects their stated preference and avoids surprising them with an early-morning notification.

**Dual enforcement**: The start date is checked both when calculating the initial reminder time and when the scheduler processes reminders. This ensures the constraint is respected even if subscriptions were created before the start date was configured, or if the date is changed after subscriptions exist.

## Current Limitations

- The start date is global across all people groups; there is no way to have different start dates for different people groups
- There is no end date feature; people groups run indefinitely once started
- Users are not notified if the start date changes after they sign up
