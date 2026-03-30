# Contact Form

## Overview

The contact form lives on doxa.life (the marketing website). When someone submits it, the submission is sent to this server for processing — creating subscriber records, sending verification emails, and notifying the team.

## What the Form Collects

- **Email** (required) — the sender's email address
- **Name** (optional)
- **Message** (required) — the content of their inquiry
- **Country** (optional)
- **Communication consent** — a checkbox to opt in to receiving general Doxa updates

## What Happens After Submission

1. The system finds or creates a subscriber record for the email address, with "contact" noted as the source
2. If the visitor checked the communication consent box, a verification email is sent with a link to confirm their address
3. The configured notification recipients receive an email with the visitor's name, email, message, and a link to their subscriber record in the admin area

## Email Verification

When a visitor opts in to communications and clicks the verification link in their email:

- A confirmation page shows that their email has been verified
- If they've already verified previously, the page notes that instead

Verification is only required for marketing consent — the contact message itself is delivered to the team regardless.

## Current Limitations

- No way to view or search past contact form submissions in the admin area
- No auto-reply to the sender beyond the verification email
- Cannot customize the notification recipients from the admin interface (configured in superadmin)
