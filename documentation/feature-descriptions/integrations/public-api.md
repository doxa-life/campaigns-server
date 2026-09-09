# Public API & API Keys

## Overview

The server exposes a documented API so other systems can read people group data, sign people up for prayer, and, for trusted callers, update records in bulk. Its main consumers are:

- **The mobile app**, for signups, prayer content, sessions, the version check, and analytics (see [Mobile App Integration](mobile-app.md))
- **The doxa.life marketing site**, which submits the contact and adoption forms and newsletter signups
- **global.doxa.life**, which fetches a ready-made bundle of people group content
- **WordPress themes and map widgets** that display people group data
- **The people group content pipeline**, whose scripts import and refresh people groups using an admin's API key

The API is described in a hand-maintained specification. A browsable reference is served at `/_scalar` on the live site, and the raw specification at `/_openapi.yaml`. Both are public and are not linked from the admin area. Keeping the specification in step with the code is a rule of the project: any change to a public endpoint must update it.

## Ways to Authenticate

Different endpoints expect different credentials, depending on who they are for.

**No credential.** Reading people group data, prayer content, the featured groups, the site-wide statistics, and the mobile version check need nothing. So do the public signup, the prayer session report, the suggestion form, and a subscriber's own profile update, which is protected only by knowing their profile ID.

**App secret.** The mobile app sends a secret bundled into it for anonymous signup, push registration, and analytics. This deters casual misuse but is not real security, because anything shipped inside an app can be extracted.

**Shared form key.** Trusted sister sites (the marketing site and global.doxa.life) send a shared key for the contact and adoption forms, newsletter signup, and the content bundle. The newsletter signup accepts either the form key or the app secret.

**Personal API key.** An admin can create keys that act as that admin. A key is sent either as a bearer token or in an API key header, and it has exactly the permissions its owner has, re-evaluated on every request. Keys work on almost every admin endpoint. The exceptions are the owner's own account settings (password, email, name, activity email preferences), image upload, and key management itself.

**Browser session.** The admin area logs in with a session that lasts seven days. When a session is present, any API key on the same request is ignored.

## API Keys

Admins manage keys in the **API Keys** card on their profile page. Only users with the Admin role see the card or can create keys.

- **Create Key** asks for a name (up to 100 characters) and then shows the full key once, with a warning to copy it immediately. It cannot be displayed again; only its first few characters remain visible in the list.
- The list shows each key's name, prefix, creation date, and when it was last used.
- **Revoke** disables a key immediately after a confirmation. Anything using it loses access at once.
- Keys are personal. Each admin sees and manages only their own, and a key cannot be used to create or revoke keys.
- Keys never expire on their own. They stop working when revoked or when the owning user is deleted. If the owner's role changes, the key's access changes with it.

Keys are stored hashed, so a database leak does not expose them.

## What the API Offers

**People group data.** A list of every people group with translated labels and a choice of fields, the full record for one group, a set of featured groups (the largest in each region), and site-wide statistics: how many groups have prayer, how many people have committed, the daily minutes committed, and how many people are praying right now. These responses are cached for five minutes and may be requested from any website.

**Prayer content and sessions.** The prayer content for a group on a given date in a chosen language, and an endpoint to report a prayer session so it counts toward statistics.

**Signups.** The normal web signup for prayer reminders, the mobile app's anonymous signup, and a newsletter-only signup with double opt-in. Signups accept campaign attribution (source, medium, campaign, and referrer) so the admin can see where subscribers come from.

**Subscriber profile.** A subscriber can update their name, email, consent settings, and one subscription at a time, identified by their profile ID. Moving a subscription to another people group merges it with any existing one there so nobody gets duplicate reminders.

**Suggestions.** The endpoints behind the public suggestion form: submitting a suggestion, verifying the reporter's email, uploading a picture, searching our list and the external datasets, and reading a group's current values. Submissions and uploads are limited to ten per hour per network address. See [People Group Suggestions](../suggestions/people-group-suggestions.md).

**Mobile app.** The version check and the analytics relay.

**Admin bulk update.** One endpoint updates up to 500 people groups per request, matched by ID or slug, changing any field including free-form metadata and tags. Every changed field is written to each group's activity log with the source "IMB Report Update". The response reports how many were updated, not found, skipped, or failed, with the first 50 error messages. This is what the quarterly IMB refresh script calls. It requires people group edit permission, so an admin's API key or a Progress Admin can use it.

## Cross-Site Access and Caching

Only the people group data endpoints allow requests directly from other websites' browsers, and only for reading. Everything else must be called from a server or from the same site. The read-only people group endpoints and the version check are cached for five minutes by browsers and the CDN, which is why the "praying now" figure is described as roughly now rather than exact.

## Design Decisions

**Why do keys inherit the owner's permissions instead of having their own scopes?** It keeps the model simple: a key is the person, acting from a script. Because only admins can create keys, and admins already have full access, adding scopes would not have narrowed anything in practice yet.

**Why can a key not manage keys?** A leaked key should not be able to mint replacements or revoke the real admin's keys.

**Why does a browser session override a key?** A logged-in admin should never accidentally act under a key that happens to be on the request.

**Why is the app secret called a deterrent?** Being honest about its limits keeps the real safeguards where they belong: rate limits, server-side validation, and never trusting client-supplied data.

**Why all lowercase-with-underscores field names?** Every field on the wire uses the same name as its database column, so nothing is translated between the API and storage and the specification reads the same as the data.

**Why a hand-written specification?** It documents intent, validation, and required fields in a way generated output would not, and keeping it current is a deliberate review step on every change.

## Current Limitations

- Keys have no scopes, no expiry, no per-key rate limit, and no usage log beyond a last-used date. Every key is effectively a full admin credential
- Creating and revoking keys is not recorded in the activity log
- There is no general rate limiting on the API, and none on key-authenticated requests
- The specification has no versioning and covers about a third of the public endpoints. Missing ones include push registration, feedback, the calendar file, unsubscribe flows, and most subscriber self-service endpoints
- The specification still carries the old "Prayer.Tools" name and has no support contact
- Two different credentials share the same header name, which confuses generated clients, and the newsletter signup is documented as taking a personal key when it actually takes the shared form key
- Browser-side integrations can only read; cross-site form posts are not enabled
- The bulk update has no dry-run mode; the scripts that call it provide one
- The adoption counters in the public people group data are placeholders that always report zero
