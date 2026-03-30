# Marketing Consent System

## Overview

Prayer reminders are transactional emails that subscribers receive automatically as part of their signup. Marketing communications are separate and require explicit consent.

We track two types of marketing consent:

**People Group Updates** allow people group organizers to send news, announcements, and updates about their specific people group to subscribers who opted in.

**Doxa General Updates** allow Doxa administrators to send progress updates and news to anyone who opted in, regardless of which people group they signed up for.

## How Consent is Collected

During signup, users see two optional checkboxes at the bottom of the form. Both are unchecked by default, requiring users to actively opt in. This approach is GDPR-compliant and ensures we only contact people who genuinely want to hear from us.

The checkboxes read:
- "Send me updates about [Campaign Name]"
- "Hear about progress and updates from Doxa"

Since users don't have accounts or log in, we show these checkboxes every time someone signs up. If a returning subscriber signs up again, their preferences are updated based on their latest selections.

## How Users Manage Their Preferences

Users can change their marketing preferences in two places:

**Profile Page** - Accessible via a link in their emails, users can toggle both types of consent on or off. They see one toggle for Doxa updates and one toggle for each people group they're subscribed to.

**Unsubscribe Page** - When users click unsubscribe in an email, they land on a page that also shows their communication preferences, allowing them to manage marketing consent alongside their reminder subscriptions.

## How Consent is Stored

Consent is tied to the specific contact method (email or phone number) used during signup, not to the person as a whole. This means if someone has signed up with multiple email addresses, each email has its own consent settings.

This design choice ensures that:
- Consent is channel-specific (email consent doesn't imply SMS consent)
- We can accurately track which contact methods are eligible for marketing
- Users can have different preferences for different email addresses

## What You Can Do With Granted Consent

**For Campaign Organizers**: You can retrieve a list of all verified email addresses that have consented to updates for your specific people group. This list only includes people whose email addresses have been verified.

**For Doxa Administrators**: You can retrieve a list of all verified email addresses that have consented to general Doxa updates, across all people groups.

## Design Decisions

**Explicit opt-in only** - Checkboxes are unchecked by default. This reduces our marketing list size but ensures higher quality engagement and legal compliance.

**Double opt-in via email verification** - Users must verify their email address before receiving any emails, including marketing. This means marketing consent requires both checking the box during signup and clicking the verification link in their email.

**Verified contacts only** - Marketing emails can only be sent to verified email addresses. If someone signs up but never verifies their email, they won't receive marketing even if they checked the boxes.

**Latest selection wins** - When returning subscribers sign up again, whatever they select (or don't select) becomes their new preference. Previous preferences are not preserved.

**Same channel consent** - If someone signs up via email, their consent applies to email. If they sign up via WhatsApp, their consent applies to WhatsApp. Consent doesn't transfer across channels.

## Current Limitations

The consent tracking is in place, but the following features are not yet built:

- Admin interface to view or export consented subscribers
- Bulk email sending tools
- Analytics on consent rates