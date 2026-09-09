# Marketing Consent System

## Overview

Prayer reminders are transactional emails that subscribers receive automatically as part of their signup. Marketing communications are separate and require explicit consent.

We track three types of marketing consent:

**People Group Updates** allow people group organizers to send news, announcements, and updates about their specific people group to subscribers who opted in.

**DOXA General Updates** allow DOXA administrators to send progress updates and news to anyone who opted in, regardless of which people group they signed up for.

**Product Emails** cover occasional messages about the prayer tools a person already uses: surveys, feedback requests, and product updates. They are not promotional, so this consent is on by default for every subscriber and can be turned off from the profile or unsubscribe pages. Opting out never affects prayer reminders.

## How Consent is Collected

During signup, users see two optional checkboxes at the bottom of the form. Both are unchecked by default, requiring users to actively opt in. This approach is GDPR-compliant and ensures we only contact people who genuinely want to hear from us.

The checkboxes read:
- "Send me updates about [Campaign Name]"
- "Hear about progress and updates from DOXA"

Since users don't have accounts or log in, we show these checkboxes every time someone signs up. If a returning subscriber signs up again, their preferences are updated based on their latest selections.

## How Users Manage Their Preferences

Users can change their marketing preferences in two places:

**Profile Page** - Accessible via a link in their emails, users can toggle each type of consent on or off. They see one toggle for DOXA updates, one for product emails, and one for each people group they're subscribed to.

**Unsubscribe Page** - When users click unsubscribe in an email, they land on a page that also shows their communication preferences, allowing them to manage marketing consent alongside their reminder subscriptions. Marketing emails also carry a one-click unsubscribe header so mail apps can offer their own unsubscribe button; using it turns off only the consent that email was sent under.

## How Consent is Stored

Consent is tied to the specific contact method (email or phone number) used during signup, not to the person as a whole. This means if someone has signed up with multiple email addresses, each email has its own consent settings.

This design choice ensures that:
- Consent is channel-specific (email consent doesn't imply SMS consent)
- We can accurately track which contact methods are eligible for marketing
- Users can have different preferences for different email addresses

## Seeing Consent in the Admin

On the Contacts page, each contact's detail panel has a **Marketing Consents** section showing their DOXA General consent (with the date it was granted) and the people groups they have opted into, all editable. Consents on an unverified email are shown as not active. The contact list marks consenting contacts with a "Doxa" badge, and the filter builder can filter by DOXA General consent and by signup source.

## Sending Marketing Emails

**Marketing → Marketing Emails** is where emails are written and sent. It is available to Admins and Progress Admins.

**Audiences.** Each email goes to one audience, and the composer shows a live recipient count for each:

- **DOXA General** — everyone who opted in to DOXA updates
- **Active Subscribers with Doxa General Consent** — opted in and currently subscribed to a people group
- **Inactive Subscribers with Doxa General Consent** — opted in, but their reminders lapsed from inactivity and they have no active subscription left. Intended for re-engagement; people who explicitly unsubscribed are not included
- **People Group** — subscribers who opted in to updates for a specific people group. Users with scoped access can only pick their own people groups
- **All Active Subscribers** — everyone with an active subscription, with or without DOXA consent. Used for product emails such as surveys, so its unsubscribe link turns off the product emails consent. Admins only
- **Pick contacts** — hand-picked contacts, bypassing consent. For testing. Admins only
- **Admins** — every admin user. The way to send a test

Every audience only ever includes verified email addresses that have not bounced or complained.

**Composing.** An email has a subject, a From sender, an audience, and rich-text content with the same editor used for libraries. A **Template** dropdown can instead select a predefined email such as a survey invitation, whose subject and content are fixed and rendered in each recipient's language. See [Surveys](surveys.md). The composer also offers a **Restart my prayer reminders** button block for re-engagement emails; at send time it becomes each recipient's personal link to resume their most recently lapsed reminder.

**Preview** renders the email in English exactly as a recipient would see it. **Save Draft** keeps it for later; only drafts can be edited or deleted. **Send Now** asks for confirmation, then sends immediately. There is no scheduling.

**Statuses.** Draft, Queued, Sending, Sent, Failed, and Cancelled. While an email is queued or sending, **Stop sending** cancels every recipient not yet emailed; messages already in flight may still go out. The list shows sent and failed counts, unsubscribes attributed to each email, and who created, edited, and sent it.

**Delivery.** Each recipient is emailed once, even if their address appears twice in a hand-picked list. Just before each send, the system re-checks that the address is still deliverable and that the person still consents to that audience, so someone who unsubscribes while a large send is in progress is skipped. Each send is recorded on the contact's activity timeline. Marketing mail goes out through a dedicated sending domain so its reputation stays separate from reminders and the inbox; until that domain is configured, sends fall back to the default transactional address.

**Senders.** **Marketing → Senders** lists the From addresses available, all on the marketing domain. Each has a display name, the part before the @, and an optional Reply-To, which defaults to the shared inbox address so replies land in the inbox. Only Admins can add, edit, or deactivate senders. When more than one sender exists, the composer requires an explicit choice.

## Design Decisions

**Explicit opt-in only** - Checkboxes are unchecked by default. This reduces our marketing list size but ensures higher quality engagement and legal compliance.

**Double opt-in via email verification** - Users must verify their email address before receiving any emails, including marketing. This means marketing consent requires both checking the box during signup and clicking the verification link in their email.

**Verified contacts only** - Marketing emails can only be sent to verified email addresses. If someone signs up but never verifies their email, they won't receive marketing even if they checked the boxes.

**Latest selection wins** - When returning subscribers sign up again, whatever they select (or don't select) becomes their new preference. Previous preferences are not preserved.

**Same channel consent** - If someone signs up via email, their consent applies to email. If they sign up via WhatsApp, their consent applies to WhatsApp. Consent doesn't transfer across channels.

## Current Limitations

- No scheduled or recurring sends; the only action is Send Now
- No test-send-to-me; the Admins audience is the workaround
- Delivery is tracked but opens and clicks are not
- No export of consented subscribers and no analytics on consent rates; the only consent figures are the live audience counts in the composer
- No segmentation beyond the fixed audiences
- A sent email cannot be duplicated into a new draft
- Two audiences, All Active Subscribers and Pick contacts, can be chosen when composing a new email but not when reopening a saved draft