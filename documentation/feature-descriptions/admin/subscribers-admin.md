# Subscribers Admin Page

## Overview

The subscribers admin page is where you manage all contacts in the system — people who have signed up for prayer reminders, submitted the contact form, or adopted a people group. It follows the same list-and-detail layout as the other admin pages, but has the most detail given the complexity of subscriber data.

## The List

Each subscriber in the list shows:

- **Name**
- **Email or phone** — Their primary contact method
- **People group badges** — One badge per people group they're subscribed to (with a count if they have multiple subscriptions to the same group)
- **Source badges** — How they entered the system (e.g., website signup, import, contact form)
- **Doxa consent badge** — A green badge if they've opted in to general Doxa updates
- **Prayer time** — Total prayer time logged, if any
- **Comment count** — Number of team comments on this record
- **Unverified badge** — A red badge if their email hasn't been verified yet
- **Created date**

### Search and filters

You can search by name, email, phone, contact ID, or tracking ID. Two filter dropdowns let you narrow the list:

- **People Group** — Show only subscribers with subscriptions to a specific group
- **Source** — Show only subscribers from a specific source

A "New Contact" button in the page header lets you create a subscriber manually by entering a name and optionally an email or phone number.

## The Detail Panel

Clicking a subscriber opens their detail panel.

### Stats

Four metrics at the top give a quick overview:

- **Status** — Active (email verified with active subscriptions) or Inactive
- **Subscriptions** — Count of active subscriptions
- **Prayer sessions** — Total number of prayer sessions recorded
- **Prayer time** — Total time spent praying

### Contact information

Editable fields for name, email (with a verified/unverified badge), phone, role (e.g., "Pastor"), preferred language, country, and data sources.

### Groups

Lists any groups (churches/organizations) this subscriber is linked to. Each group name is a clickable link to the group's admin page. You can add or remove group memberships.

### Marketing consents

Toggle switches for marketing preferences:

- **Doxa General Updates** — Whether they receive general Doxa communications
- **People Group Updates** — Badges showing which people groups they've consented to receive marketing about. You can add or remove individual people group consents.

If the subscriber's email is not verified, consents are shown but disabled with a warning that they aren't active until verification.

### Subscriptions

An expandable list of all prayer reminder subscriptions. Each subscription shows:

- **People group name** and **status** (active, pending, inactive, or unsubscribed)
- When expanded: frequency, days of week (for weekly), preferred time, timezone, prayer duration, next scheduled reminder, and status

For each subscription, you can:

- **Send Reminder** — Manually trigger a reminder email (useful for testing or customer support)
- **Send Follow-up** — Manually send a commitment check-in email

### Metadata

Read-only information: tracking ID, a copyable profile link (the subscriber's self-service URL), and the date they joined.

### Activity and comments

Two tabs on the right side:

- **Activity** — A detailed log showing prayer sessions, emails sent, follow-up responses, profile changes, and other events, each with timestamps and context
- **Comments** — Team notes and discussion (see [Comments & Mentions](comments-and-mentions.md))

### Deleting a subscriber

The delete button opens a confirmation dialog warning that all subscriptions will be permanently removed.

## Current Limitations

- Cannot bulk-delete or bulk-edit multiple subscribers
- No way to manually mark an email as verified from the admin interface
- You can create contacts manually, but cannot add prayer reminder subscriptions for them — they must sign up through the public form to create reminders
