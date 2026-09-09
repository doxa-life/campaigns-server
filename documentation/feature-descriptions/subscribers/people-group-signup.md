# People Group Signup Page

## Overview

Each people group has a public-facing page where visitors learn about the group and sign up for prayer reminders. This is the main entry point for new subscribers.

## What Visitors See

The page is a long-form layout with several sections:

**People group information** — A large image, the group's name, and a description. A "See full profile" link leads to external research resources. Next to the main signup button sits a **Share this page** button offering the same sharing tools as the header.

**Key statistics** — A grid showing the group's country, population, language, religion, engagement status, and existing churches. An interactive map shows the geographic location.

**Prayer commitment progress** — A count of how many people have committed to pray, shown against the goal with a progress bar.

**Why pray** — Three cards explaining the purpose: the group has no one praying for them, prayer opens doors, and praying changes you.

**Sample prayer content** — A preview of what daily prayer content looks like, giving visitors a sense of what they'll receive.

## The Signup Form

The form has two sections:

### Prayer preferences

- **Frequency** — Daily or weekly. Weekly subscribers choose which days of the week.
- **Duration** — How long they plan to pray: 5, 10, 15, 30 minutes, or 1 hour.
- **Reminder time** — What time of day they want their reminder.
- **Timezone** — Auto-detected, with a searchable dropdown to change it.

### Contact information

- **Name** — Required.
- **Email** — Required.
- **Communication consent** — Two optional checkboxes: receive updates about this people group, and receive general DOXA updates.

After submitting, a modal confirms the signup and asks the visitor to check their email. They must click the verification link to activate their reminders.

## After Verification

When the visitor clicks the verification link, a confirmation page shows that their email is verified. The page offers:

- **Calendar links** — Add the prayer reminder to Google Calendar or download an ICS file for other calendar apps.
- **Start Praying** — A button linking directly to the prayer content page.

Returning subscribers who have already verified their email skip this step — their signup activates immediately.

## Sharing

The page includes sharing tools in the header and beside the signup button:

- **QR Code** — Opens a modal with a QR code for the page URL. Useful for printing on flyers, bulletins, or prayer guides so people can scan and sign up.
- **Share link** — On mobile, opens the device's native share sheet. On desktop, copies the page URL to the clipboard.

## Where Signups Come From

Nothing on the form changes for the visitor, but each signup records where the person came from. When someone arrives through a link carrying campaign tags (the standard "utm" parameters) or from another website, that first touch is remembered in their browser for 90 days and attached to any signup they make. Direct visits and browsing within the site do not overwrite it. Signing up again through a tagged link re-attributes the subscription; a direct re-signup keeps the original.

In the admin, the source appears on each subscription in the contact's detail panel, as a **Signup Source** filter on the Contacts page, and as the **Signups by Source** chart on the dashboard.
