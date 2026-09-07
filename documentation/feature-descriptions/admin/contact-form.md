# Contact Form

## Overview

The contact form lives on doxa.life (the marketing website). When someone submits it, the submission is sent to this server for processing — creating subscriber records, opening an inbox conversation, acknowledging the sender, and notifying the team. The mobile app's feedback form goes through the same pipeline.

## What the Form Collects

- **Email** (required) — the sender's email address
- **Name** (optional)
- **Message** (required) — the content of their inquiry
- **Country** (optional)
- **Communication consent** — a checkbox to opt in to receiving general DOXA updates

## What Happens After Submission

1. The system finds or creates a subscriber record for the email address, with "contact" noted as the source
2. If the visitor checked the communication consent box, that consent is recorded on their email address
3. The message opens a conversation in the shared inbox, and staff are notified
4. The visitor receives an acknowledgement email. If their address has not been verified before, the acknowledgement asks them to confirm it and carries the confirmation link; a verified address gets a plain acknowledgement

## Email Verification

Every sender whose address is not yet verified is asked to confirm it, whether or not they opted in to communications. The message itself is delivered to the team either way; verification tells staff whether a reply will reach a confirmed address.

When the visitor clicks the confirmation link:

- A confirmation page shows that their email has been verified
- If they've already verified previously, the page notes that instead
- Any pending prayer subscriptions on that address are activated

Until the link is clicked, the conversation in the inbox shows an "Unverified" badge next to the sender's address and above the reply box. The link stays valid for 7 days; a repeat submission from the same address reuses the outstanding link, and a new one is issued after it expires.

## Current Limitations

- No way to view or search past contact form submissions in the admin area
- Cannot customize the notification recipients from the admin interface (configured in superadmin)
