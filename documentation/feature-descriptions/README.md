# Feature Descriptions

This folder contains documentation about how our systems work. These documents are meant to be shared with the team so we can make decisions together about how to use and extend features.

## What belongs here

Each document explains a feature or system in plain language:
- What it does and why
- How users interact with it
- Key decisions that shaped the design
- Current limitations we should be aware of

## What doesn't belong here

These documents should not include:
- Code snippets or implementation details
- Database table names or schemas
- Technical jargon that requires developer knowledge

If someone needs those details, they can look at the code directly.

## Contents

### content/ — Creating and managing prayer content
- [Libraries & Content](content/libraries-and-content.md) — How libraries work, content editing, Bible verses, virtual libraries
- [Library Import & Export](content/library-import-export.md) — Moving libraries between environments
- [Content Translation](content/content-translation.md) — Translating content with DeepL
- [Prayer Fuel: People Groups](content/prayer-fuel-people-groups.md) — Virtual libraries that display people group info

### subscribers/ — Subscriber lifecycle and communication
- [People Group Signup](subscribers/people-group-signup.md) — The public signup page, form fields, sharing tools
- [Prayer Content Page](subscribers/prayer-content-page.md) — What subscribers see when they pray
- [Notifications](subscribers/notifications.md) — Prayer reminder delivery and scheduling
- [Subscriber Communication](subscribers/subscriber-communication.md) — Welcome emails, adoption emails, calendar links
- [Subscriber Profile](subscribers/subscriber-profile.md) — Self-service settings and preference management
- [Commitment Follow-Up](subscribers/commitment-followup.md) — Check-in emails and automatic pausing
- [Prayer Tracking](subscribers/prayer-tracking.md) — How prayer sessions and statistics are captured

### adoption/ — People group adoption
- [People Group Adoption](adoption/adoption.md) — Adoption forms, groups, reports, and reminders

### admin/ — Admin tools and team management
- [Admin Dashboard](admin/admin-dashboard.md) — Landing page stats and charts
- [People Groups](admin/people-groups-admin.md) — Managing people group records
- [Groups](admin/groups-admin.md) — Managing churches and organizations
- [Subscribers](admin/subscribers-admin.md) — Managing contacts and subscriptions
- [Comments & Mentions](admin/comments-and-mentions.md) — Team collaboration on records
- [User Management](admin/user-management.md) — Inviting users and assigning roles
- [Permissions](admin/permissions.md) — Roles and access control
- [Activity Summary Emails](admin/activity-summary-emails.md) — Periodic platform metrics reports
- [Contact Form](admin/contact-form.md) — Processing submissions from doxa.life

### campaign-setup/ — Campaign configuration
- [People Group Start Date](campaign-setup/people-group-start-date.md) — Global launch date for prayer campaigns
- [Marketing](campaign-setup/marketing.md) — Marketing consent system
