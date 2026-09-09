# Shared Inbox

## Overview

The Inbox is a shared, two-way email inbox inside the admin area. Messages sent to doxa.life addresses, contact form submissions, and mobile app feedback all arrive as conversations attached to the contact's record. Staff reply from doxa.life addresses, and the contact's replies come back into the same thread.

Before the inbox existed, contact form messages only triggered a notification email, replies went out from personal mailboxes, and nothing was captured. The inbox keeps the whole exchange in one place, lets the team triage and assign work, and gives an AI assistant enough context to draft replies for a person to review.

The inbox is in the admin sidebar. Conversations also appear on the contact's record under a Conversations tab, where staff can reply or start a new email without leaving the contact.

## Where Conversations Come From

**Email to a doxa.life address.** Anything sent to an address on doxa.life lands in the inbox. Mail to the shared contact address, or to any address nobody owns, opens an unassigned conversation. Mail to a staff member's personal alias (for example a first name at doxa.life) opens a conversation assigned to that person. Replies from contacts go to a per-conversation reply address, so they thread onto the right conversation even if the contact changes the subject.

**The contact form on doxa.life.** Submissions open a conversation marked "Contact form", with the first line of the message as the subject. The sender gets an automatic acknowledgement in their language. See [Contact Form](contact-form.md).

**Feedback from the mobile app.** The app's feedback form opens a conversation with the subject prefixed by the feedback type (Compliment, Suggestion, or Problem) and tags it accordingly. Device details such as platform and app version are appended so problems can be diagnosed.

**New email from the team.** The **New email** button in the inbox header, or on a contact's record, starts a conversation from the team's side. It is created in Pending status and assigned to whoever sent it.

**Replying from your own mail client.** Staff notification emails carry a special reply address. Replying to the notification sends the reply to the contact and records it in the conversation. This works only from a mailbox whose domain authenticates properly and only for users with send permission; anything else is held for review.

## How Senders Are Verified

The inbox never trusts the "From" line of an email on its own, because it is trivial to forge. Each inbound message is matched to a conversation in one of these ways:

1. It arrived at a conversation's reply address
2. It is a reply to a message we sent, and the sender's address belongs to the contact on that conversation
3. It arrived at a staff alias, so it opens a conversation assigned to that person
4. None of the above: the sender is looked up or created as a contact, and a new conversation opens

An email whose sending domain passes authentication checks also marks that contact's email address as verified. This is treated as stronger proof of ownership than clicking a link.

Messages that cannot be safely matched are **held** rather than filed: an unknown sender replying into a conversation, an expired reply address, or a staff reply from a mailbox that fails authentication. Held messages flag the conversation as **Needs review**, appear in the review queue, and trigger a "[Review]" notification. The sender receives a short courtesy note saying a team member will look at it.

Out-of-office and other automatic replies are recognised and handled quietly. A vacation reply from a known contact closes the conversation instead of reopening it, and no staff notification is sent.

## The Inbox Page

### Folders and filters

The left rail has a **Needs review** folder with a count of held or flagged conversations, then three scope folders: **All**, **Unassigned**, and **Mine**. Below those, every tag appears as a folder with a coloured dot and count.

Above the list, a status strip switches between **Open** (the default), **Pending**, **Closed**, **Spam**, and **All**. Scope and status combine, so "Mine" plus "Pending" shows the conversations you are waiting on.

A search box matches conversation subjects, contact names, and contact email addresses. It does not search message text.

### The list

Each row shows the contact's name, when the last message arrived, the subject, a snippet of the latest message, and badges for status, source (Contact form, Email, Staff, or Feedback), the assignee, any tags, and warnings such as **Needs review** or **No message**. The "No message" badge marks a conversation whose message failed to store; it is kept visible on purpose so the failure gets noticed.

### Bulk actions

Hovering a row reveals a checkbox. Selecting rows shows a bar with the count, a **Select all** link, and three actions: set status (Open, Pending, or Closed), assign to a team member, and add a tag. Closing in bulk asks for confirmation. Spam cannot be applied in bulk because it blocks a sender everywhere; it stays a deliberate per-conversation decision.

### The conversation view

Opening a conversation shows the subject, the contact's name linked to their record, their email address, and badges: **Unverified** if the address has not been confirmed, and **Not receiving email** with the reason and date if mail to it has bounced or been marked as spam.

Controls at the top set the assignee and status, toggle the review flag, and (for pending or closed conversations) offer **Add to knowledge base**.

Messages appear in order, each marked **Received** or **Sent**, with delivery badges on sent messages (Sending, Delivered, or Failed with the reason) and an **AI** badge on drafts the assistant produced. Long quoted history in inbound mail is collapsed behind a **Show quoted text** toggle. Attachments appear as chips that download when clicked.

### Replying

The reply box shows exactly which address the reply will go to, with its verification and deliverability badges. If the address has bounced or complained, a warning explains that the reply will not be delivered.

- **From**: choose between your personal alias ("Name with Doxa") and the general contact address ("Doxa Prayer"). New conversations default to the general address; a conversation already answered personally stays personal for continuity.
- **Signature**: your signature is added automatically on personal sends, never from the general address. A notice above the buttons says which will happen, with a preview.
- **Canned responses**: pick a saved response and a language to insert its translation. Canned responses are managed by users with send permission.
- **Formatting**: bold, italic, headings, lists, quotes, links, images, and dividers. Images pasted into a reply are stored privately and embedded in the outgoing email rather than linked.
- **Attach file**: up to 25 MB per file. Executable file types are blocked in both directions.
- **Draft reply (AI)**: see below.
- **Save Draft** keeps the reply for later. Opening the conversation again loads the latest draft automatically.
- **Send** queues the reply. The conversation moves to Pending and is assigned to you if it was unassigned.

The emailed copy of a reply includes the earlier messages quoted below it, so the contact has context even if their mail client does not thread. In the inbox itself, each message is shown once.

### Tags

Tags are a shared palette with seven colours. Anyone with inbox access can apply, create, or delete tags from the picker in the conversation view. Renaming a tag keeps it on every conversation; deleting one removes it everywhere. Three tags are created automatically for app feedback: **Feedback: Compliment** (green), **Feedback: Suggestion** (blue), and **Feedback: Problem** (amber).

### Notes and activity

A **Notes & Activity** tab on the side of the conversation shows internal notes and the activity log in one timeline. Notes support @-mentions, which email the mentioned team member a link to the conversation. Notes are never visible to the contact. See [Comments & Mentions](comments-and-mentions.md).

## Statuses

| Status | Meaning |
|---|---|
| **Open** | The ball is with the team |
| **Pending** | We replied and are waiting on the contact |
| **Closed** | Done |
| **Spam** | The sender is blocked |

**Needs review** is a flag rather than a status. It applies to any status and drives the review queue.

Status changes happen automatically in these cases:

- A new inbound email, contact form message, or feedback opens as **Open**
- Sending a reply moves the conversation to **Pending** and clears the review flag
- A reply from the contact moves Pending or Closed back to **Open**
- An out-of-office reply **closes** the conversation
- Closing a conversation, alone or in bulk, clears the review flag
- **Pending conversations with no reply for 14 days close automatically** each night. Flagged conversations are exempt, and a later reply from the contact reopens the conversation, so nothing is lost

Closing asks for confirmation and notes that the conversation will reopen if the contact replies.

## Spam

**Mark as spam** blocks the sender's address, closes all their conversations as Spam, and files any future messages from them onto their existing spam thread without notifying anyone. Choosing any other status on a spam conversation unblocks the sender and reopens it. The spam score from the email provider is stored but not used to classify automatically; blocking is always a human decision.

## Delivery, Bounces, and Suppression

Outgoing messages show **Sending** until the email provider confirms delivery, then **Delivered**, or **Failed** with the reason.

When the provider reports a hard bounce or a spam complaint, that email address is suppressed: every part of the system stops sending to it, including prayer reminders and marketing, and the contact's activity timeline records an "Email Suppressed" entry. In the inbox the address shows **Not receiving email**, and replies to it are refused rather than silently lost. An address that bounced once but is not yet suppressed shows **Previously bounced**. Temporary failures are not treated as bounces; the provider retries them.

Unsubscribe reports from the provider only affect marketing consent. They never suppress the address or stop transactional mail. Delivery events never mark an address as verified; only an authenticated inbound email or a clicked link does that.

Replies to unverified addresses are allowed. The badge is a hint, not a block. The automatic acknowledgement sent to an unverified contact-form sender asks them to confirm their address.

## AI Draft Replies

**Draft reply (AI)** opens a modal that writes a suggested reply for the conversation. You can type steering instructions before generating, then **Refine** with further instructions, and finally **Use response** to place the draft in the reply box. Nothing is saved until you choose to use it, and nothing is ever sent by the AI. A person always reviews, edits, and sends.

The draft is written in the contact's language. When that is not English, a side-by-side English translation lets an English-only reviewer check it. The modal also lists anything the AI was unsure about and which sources it drew on.

The AI is given:

- A voice and tone guide: warm, personal, pastoral, plain language, always "DOXA" in capitals, never inventing DOXA-specific facts such as giving guidelines or dates, and never making commitments on DOXA's behalf. Where a fact is missing it leaves a bracketed placeholder and flags it rather than guessing
- Snapshots of the public doxa.life pages (About, FAQ, Definitions, Vision, Pray, Adopt, Research, Resources) and the list of country pages so it can link contacts to their region
- The team's own feature descriptions in this documentation folder, as a reference for how the platform works
- Anonymised answers captured in the knowledge base
- The contact's record: name, language, country, prayer activity, subscriptions, and adoptions, plus the full conversation. The contact's email address is deliberately withheld

Steering instructions accumulate across refinements and are shown as removable chips, so "make it shorter" cannot silently undo "mention the groups in Chad". Regenerating never overwrites a draft a person wrote; a fresh draft is created alongside it.

AI drafting requires the AI service to be configured. Without it the button explains that drafting is not set up.

## Knowledge Base

Good answers can be saved for future drafts. On a pending or closed conversation, **Add to knowledge base** asks the AI to turn the thread into one generalised question and one reusable answer with all personal details removed: names, addresses, organisations, locations, and identifying circumstances. The proposal is shown for editing, with a note listing what was stripped, and is only saved when a person clicks **Save entry**.

The **Inbox knowledge base** page lists every entry, with filters for active and archived. Entries can be edited, archived, restored, or permanently deleted. Only active entries are given to the AI.

The same page has a **Refresh site content** button that re-fetches the doxa.life page snapshots on demand. They also refresh automatically every night and shortly after each deploy. If a page cannot be fetched, the previous snapshot is kept, so drafting keeps working when the marketing site is unreachable.

## Staff Notifications

- **New conversation** (email, contact form, or feedback) with no assignee: emailed to every user who has turned on contact-us notifications in their user settings
- **Held message**: the same recipients, with a "[Review]" subject
- **Reply on an assigned conversation**: emailed to the assignee only
- **@-mention in a note**: emailed to the mentioned users

Notification emails include the message, any attachment names, and a link to the conversation. For recipients with send permission, replying to the notification replies to the contact. Being assigned a conversation does not send a notification, and there are no in-app notifications.

## Who Can Do What

Two permissions control the inbox. **View** allows reading, assigning, changing status, tagging, bulk actions, notes, and reading the knowledge base. **Send** additionally allows composing and replying, drafts, attachments, canned responses, AI drafting, marking spam, editing knowledge entries, and refreshing site content. Marking spam requires send permission because it blocks a sender everywhere.

Admins, Progress Admins, and Inbox Agents hold both. Conversations can only be assigned to users with inbox access.

Each user's sending identity (alias and signature) is set on the Users page. A user may edit their own signature; changing an alias or another user's identity requires user management permission.

## When a Contact Is Deleted

Deleting a contact removes their conversations, messages, attachments, stored original emails, and internal notes. Nothing else is deleted automatically. Conversations, messages, and attachments are kept indefinitely; auto-close only changes status. Deleting a staff user unassigns their conversations rather than removing them.

## Design Decisions

**Why hold messages instead of guessing?** A forged "From" could otherwise graft a stranger's email onto a contact's thread, or let an outsider send mail as staff. Anything that cannot be matched with confidence waits for a person.

**Why does an authenticated email verify an address?** Verification gates prayer reminder delivery. A message that passes domain authentication proves the sender controls the mailbox at least as well as a clicked link does. Delivery reports never verify an address, because they only show mail was accepted, not who owns it.

**Why keep verification and deliverability separate?** A verified address can still bounce. Suppression lives on the address and applies to every kind of mail; verification is about ownership and consent.

**Why can a reply be lost but never duplicated?** Sending marks the message as sent immediately before handing it to the provider. If the server crashes in that instant, the reply may not go out, but the contact will never receive the same reply twice. The old order, send then record, could double-send.

**Why is the AI draft-only?** Replies carry DOXA's name and pastoral responsibility. The AI saves time on the first draft; the judgement stays with a person.

**Why strip personal details from knowledge entries?** Entries become long-lived AI grounding. Anonymising at capture keeps that corpus free of personal data even though the underlying conversations still hold it.

**Why do reply emails have no logo banner?** A branded, "automated notification" shell would make a person's reply look impersonal and false. Contact-facing mail uses a light, plain shell; staff alerts use the normal admin template.

**Why do out-of-office replies close the conversation?** Filing them opened bogus "unknown sender" conversations that pinged staff. Real bounces are handled separately because they signal an actual delivery failure.

**Why is spam excluded from bulk actions?** Blocking a sender affects every conversation they have and everything they send in future. That should be a considered, individual decision.

## Current Limitations

- No unread state: triage relies on status, assignment, the review flag, and tags
- The list shows at most 100 conversations for the current filter with no way to page further; older ones are reachable only from a contact's record or by direct link
- Search does not cover message text
- Drafts can be saved and loaded but not deleted from the page, so they accumulate
- The knowledge base link in the inbox is hidden from view-only users even though they may read the page
- Attachments that are too large or of a blocked type are dropped from inbound mail with no marker in the thread
- The spam score is stored but not shown or used
- Canned responses insert fixed text; there are no placeholders for the contact's name or other details
- No in-app notifications and no notification when a conversation is assigned to you
- Long threads quote the entire history in every outgoing reply, so emails grow with each exchange
- Email is the only channel; WhatsApp and chat are not connected
- Nothing is ever purged: conversations, attachments, and stored original emails are kept forever
