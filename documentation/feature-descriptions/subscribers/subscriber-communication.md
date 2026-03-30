# Subscriber Communication

## Overview

The system sends several types of emails to subscribers as part of the signup and reminder process. This document covers the automated emails that subscribers receive.

## Welcome Email

The welcome email is the first email a subscriber receives after their email address is verified. It confirms their signup was successful and provides links to get started.

### When It's Sent

The welcome email is sent immediately when:

**New subscriber verifies their email** - After clicking the verification link in the signup confirmation email, the subscriber receives a welcome email confirming they're all set.

**Returning subscriber signs up with a verified email** - If someone who previously verified their email signs up again (for a new reminder schedule), they receive a welcome email immediately without needing to re-verify.

**Reactivating a previous subscription** - When someone resubscribes to a schedule they previously unsubscribed from, and their email is already verified, they receive a welcome email.

### What It Contains

The welcome email includes:

- Personalized greeting using the subscriber's name
- The people group title they signed up for
- Confirmation that their email is verified and reminders are set up
- A "Start Praying" button linking directly to the prayer content page
- A "Manage Preferences" button linking to their profile page where they can update settings
- Calendar links to add the prayer reminder to Google Calendar or download an ICS file

## Adoption Emails

When someone adopts a people group, the system sends a separate set of automated emails:

**Adoption Verification Email** — Sent to new users who haven't verified their email. Contains a link to confirm their address and activate the adoption.

**Adoption Welcome Email** — Sent when an adoption becomes active (either after verification or immediately for returning users). Includes links to the people group profile, external resources, a getting started guide, and a count of remaining unadopted groups. Translated into the adopter's preferred language, with right-to-left layout for Arabic.

**Adoption Reminder Email** — Periodic emails to the primary contact of each adopting group, listing their adopted people groups with links to submit prayer updates.

## Current Limitations

- Welcome email content and branding cannot be customized per people group
- No tracking of whether welcome emails are opened
- Only email is supported (no WhatsApp or in-app welcome messages)
