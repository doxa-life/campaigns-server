# Mobile App Integration

## Overview

The DOXA Prayer app for iOS and Android uses this server as its backend. The app has no accounts and no login. Each install generates its own identity, commits to pray for people groups, downloads the daily prayer content, and reports prayer sessions back so app users appear in the same statistics as web subscribers.

The server's side of that relationship covers:

- Anonymous signup and a stable identity for each device
- Prayer content and prayer session recording
- A launch-time version check that can ask users to update
- Registering devices for push notifications
- Relaying the app's analytics events
- Receiving feedback from the app's feedback form
- Links that open the app, or send people to the right store

Most app requests carry a shared secret bundled into the app. This is a deterrent against casual misuse rather than real authentication, since anything shipped inside an app can be extracted. Real protection comes from rate limits and from the fact that the app can only do what any visitor could do on the website.

## How App Users Are Identified

When the app first signs up, the server creates a subscriber record with no name and no contact details and returns two identifiers:

- A **tracking ID**, which the app stores and sends with every later request. It is the device's identity and is used to match prayer activity to the subscriber. Once issued, it is never replaced, so the app's stored identity stays valid across reinstalls that preserve local data.
- A **profile ID**, which addresses the subscriber's settings page. The app can open the same profile page web subscribers use to manage their reminders and preferences.

App subscribers are tagged with an "anonymous app" source so staff can tell them apart in the admin area. In the admin they appear as "Anonymous" with no email unless they later supply one.

### Supplying an email

The app can optionally send an email address and name with a signup. Email is the canonical identity across the whole system, so if that address already belongs to a web subscriber, the app subscription attaches to that existing record rather than creating a second person. If the email is new, it is attached to the anonymous app record.

An email on its own is only used for this matching. The person is only added to the newsletter and marketing consent is only recorded if they also ticked a consent box in the app, in which case they receive the normal verification email. See [Marketing](../campaign-setup/marketing.md).

## Signing Up to Pray

A signup from the app records the people group, a daily or weekly frequency, the chosen days for weekly, an optional reminder time, timezone, and language. If the language is not one the site supports, English is used.

Each subscriber has at most one app subscription per people group. Signing up again for the same group updates the existing subscription and reactivates it if it had lapsed. This also protects against an accidental double tap creating duplicates.

For prayer time statistics, a signup without a reminder time counts as a five-minute daily commitment. A signup with a time uses the standard ten-minute default. See [Prayer Tracking](../subscribers/prayer-tracking.md).

The subscriber's activity timeline records each signup with the source "Mobile app (anonymous)" and the chosen schedule.

### Reminders happen on the device

The server never sends reminders to app users. Email reminders, follow-up check-ins, and re-engagement emails all go only to verified email subscriptions. The app schedules its own local notifications from the stored schedule. The server keeps the schedule so it shows in the admin and counts toward committed prayer time.

## Prayer Content and Prayer Sessions

The app fetches each day's prayer content for a people group in the user's language, with English as the fallback when a translation is missing. The response includes the Bible translation copyright notices the content requires.

While someone prays, the app reports the session the same way the web prayer page does: an initial report, then periodic updates carrying the elapsed time. The server keeps one record per session and updates its duration on each report. The location attached to a session comes from the network connection, coarsened to roughly city level, and is fixed on the first report so it never moves mid-session. Sessions longer than two hours are capped.

These sessions feed the people group statistics, the admin dashboard, and the **people praying with you now** count, which counts distinct sessions reported in the last five minutes across the app and the web.

## Inactivity

Every night the server looks for app subscriptions that have been active for more than 30 days with no prayer session for that people group in the last 30 days, and marks them inactive. Praying for one people group does not keep a different group's subscription alive.

The reverse also happens automatically: an inactive app subscription whose person prays for that group again is reactivated. Only subscriptions the system marked inactive are reactivated. A subscription the person or an admin stopped stays stopped, so an opt-out is never silently reversed.

Both changes are written to the subscriber's activity timeline as "Marked inactive — no prayer activity for 30 days (mobile app)" or "Reactivated — prayer activity resumed (mobile app)". Inactivations appear in the activity summary emails under "Became inactive", separately from people who unsubscribed themselves. See [Activity Summary Emails](../admin/activity-summary-emails.md).

## Version Check

On launch and resume, the app asks the server for the latest released version, the minimum supported version, and the store links for each platform. The app then decides what to do: show an optional update banner if a newer version exists, or a blocking prompt if the installed version is below the minimum.

Both version numbers are stored as settings that can be changed at runtime without a deploy, so a rollout or a forced upgrade is a configuration change. They can currently be changed only through the API by a user with content editing permission; there is no admin page for them. The store links come from server configuration. The iOS link is empty until the App Store ID is configured.

## Push Notifications

The app registers each device's push subscription (via OneSignal) with the server, along with its tracking or profile ID and platform. The server stores the mapping between the device and the subscriber. If the device has not completed signup yet, the registration is accepted quietly and the app retries later.

The server does not send push notifications today. The mapping exists so that a future server-side sender can target devices by subscriber. Any pushes users receive now are either composed in the OneSignal dashboard or scheduled locally by the app.

## Analytics

The app sends its analytics events to this server, which forwards them to DOXA's analytics service. Relaying through the server keeps the analytics credentials out of the app. The app's events are limited to app opens and language switches. Signups, prayer sessions, and feedback submissions are recorded server-side as they happen.

Before forwarding, the server strips any personal details (names, emails, phone numbers, message text, profile IDs, tokens) from event data. An email address is never accepted from the app for analytics; only a pre-hashed identifier is.

## Feedback

The app's feedback form opens a page on this server inside the app, passing the device's tracking ID and basic diagnostics (platform, OS version, device model, app version and build, timezone). The person chooses **Compliment**, **Suggestion**, or **Problem**, and enters their email and message.

The submission opens a conversation in the shared inbox with the type in the subject and a matching tag, and the diagnostics appended as a "Device info" block. Because a browser page cannot safely hold a secret, the form is protected by a limit of ten submissions per hour per network address instead. See [Shared Inbox](../admin/inbox.md).

## Links That Open the App

Two kinds of links open the app directly when it is installed:

- The prayer page for a people group, with or without a date, opens the app's Pray screen
- A smart link of the form `pray.doxa.life/app/<people-group>` opens that group in the app

When the app is not installed, the smart link behaves sensibly for the visitor. On a phone it briefly tries to open the app, then sends them to the App Store or Google Play. The Play link carries the people group, so a fresh install can select it automatically. On a desktop it goes to the store the visitor chose, or to the people group's web page if no store applies.

**Get the Mobile App** badges appear on a people group's public page when the page is opened with a special flag in the address, so the badges can be shown in targeted campaigns without appearing for everyone.

## Design Decisions

**Why no accounts?** The app should let someone start praying in seconds. A device identity is enough to record commitments and sessions, and an email can be added later for anyone who wants reminders by email or a newsletter.

**Why does the server record schedules it never uses for sending?** So app commitments count in the statistics and show in the admin next to email subscriptions, even though the device does the reminding.

**Why treat the app secret as a deterrent only?** Honesty about what a bundled secret can and cannot do keeps the real safeguards where they belong: rate limits, server-side validation, and never trusting client-supplied locations or identities.

**Why mark inactive rather than unsubscribe?** Inactive means the system stopped counting a commitment nobody was keeping. The person did not choose it, so the system is free to reverse it when they return. Stops chosen by a person are recorded differently and are never undone automatically.

**Why relay analytics through the server?** It keeps credentials off the device, lets the server scrub personal data, and makes the traffic first-party.

**Why honour the store the visitor clicked?** Guessing the platform from the browser is unreliable. When the badge already says which store, that choice wins.

## Current Limitations

- Push notifications are receive-only; the server stores device registrations but sends nothing
- No admin page for the version check settings; they are changed through the API
- The App Store ID stored through the admin API has no effect, because the live value comes from server configuration
- App users who lapse receive no outreach, since re-engagement emails go only to email subscribers
- The app reports only two analytics events and no engagement duration
- Prayer session and profile requests are not protected by the app secret; anyone who knows a session or profile ID can use them
- The "anonymous app" and "news" sources are not selectable in the admin's source filter and show as raw keys
- Several app endpoints, including push registration and feedback, are missing from the published API documentation
