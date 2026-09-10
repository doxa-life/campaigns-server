# Permissions System

## Overview

The permissions system controls what logged-in users can see and do. Each user holds one or more roles, and their access is the combination of everything those roles grant. Some roles are global; others are scoped, meaning they apply only to the people groups or the languages a user has been assigned.

## Roles

Seven roles are available, shown in this order on the Users page.

**Admin** has full access to everything: all people groups, groups, churches, contacts, content, the inbox, marketing, and user management. Admins see the complete admin interface and need no assignments. Only Admins can manage churches, create API keys, manage marketing senders, or send to the broadest marketing audiences.

**Progress Admin** monitors prayer progress and handles outreach. They can view and edit any people group, review public suggestions, view groups and contacts, run the shared inbox, and create and send marketing emails to consenting contacts. They cannot create or delete people groups, edit or delete contacts, work on libraries, manage users, or manage churches. Progress Admins also receive the activity summary emails alongside Admins.

**People Group Editor** works only within the people groups they have been assigned. For those groups they can view and edit the group record, view, edit, and delete its subscribers, see the groups that have adopted it, and create and edit content in the libraries linked to it. They cannot see other people groups, create libraries, manage users, or use the inbox or marketing tools. The Libraries section is hidden from their sidebar; they reach content through their people groups.

**Content Editor** manages library content in every language but nothing else. They see only the Dashboard and Libraries.

**Translator** can read library content in every language but can only create, edit, or delete content in the languages they have been assigned. They cannot create or delete libraries, import libraries, change the prayer fuel order, or run bulk translations. Inside a library, days in their languages show an Edit button and days in other languages show View, with the editor read-only. Translation tools only offer their assigned languages as targets. They see only the Dashboard and Libraries.

**Inbox Agent** handles the shared email inbox: triage, reply, and send. They see only the Dashboard and Inbox.

**Personal Inbox Agent** handles only the conversations assigned to them: mail sent to their own alias (for example a first name at doxa.life) and anything a colleague hands them. They reply from that alias only, can pass a conversation to another inbox user, and can use but not manage tags, canned responses, and the knowledge base. They see only the Dashboard and Inbox.

**No role** is the state of a newly registered user. They can log in but see an "Account Pending Approval" page with a **Check Status** button until an admin assigns a role. Users who registered through an invitation may already have roles pre-assigned.

**Superadmin** is a separate flag layered on top of the roles, not a role itself. It unlocks the Superadmin page: manual database backups, AI and translation model settings, the AI service key check, bulk Day-in-the-Life translation, rebuilding verses, refreshing prayer counts, importing people group descriptions, and diagnostics. There is no interface for granting it; it is set directly in the database.

## Combining Roles

A user can hold several roles at once, chosen with checkboxes on the Users page. Their access is the union of the roles. For example, someone who is both a Translator and a People Group Editor can edit any language inside the libraries of their assigned people groups, plus their assigned languages in every other library.

## Granting Access

Roles are assigned when inviting a user or afterwards from the Users page. Scoped roles need assignments before the user can see anything:

- **People Group Access** appears in a user's settings when they hold a scoped role. Pick the people groups they may work on. The Users list shows a "People Groups (N)" badge for each such user.
- **Language Access** appears when they hold the Translator role. Tick the languages they may edit from the site's supported languages.
- **Email alias** is what routes mail to a Personal Inbox Agent and is the only address they send from. Set it in the user's inbox identity; until then they can read what is assigned to them but not reply.

Assignments save immediately. Admins and Progress Admins need no assignments; their access is global.

To set up a new team member:

1. Invite them from the Users page, choosing their roles during invitation
2. Once they register, adjust their roles if needed
3. For scoped roles, open their settings and assign people groups or languages

## Choosing the Right Role

- **Admin** for people who run the platform: all people groups, users, libraries, churches, and system settings
- **Progress Admin** for people who track engagement and talk to contacts: editing people groups, reviewing suggestions, the inbox, and marketing emails, without user management or content editing
- **People Group Editor** for partners who own specific people groups and should not see others
- **Content Editor** for writers who work on libraries in every language
- **Translator** for reviewers who work in particular languages only
- **Inbox Agent** for people whose whole job is answering email
- **Personal Inbox Agent** for people who answer mail sent to their own doxa.life address and should not see the rest of the inbox

## Subscriber Access

People Group Editors can see and manage subscribers who have subscriptions to their assigned people groups:

- **View**: See subscriber details, contact info, and subscription settings
- **Edit**: Update subscriber names and subscription settings (frequency, time, timezone)
- **Delete**: Remove subscriptions from their people groups
- **Activity**: View subscriber activity logs and email history
- **Send Reminders**: Manually send prayer reminder emails

If a subscriber has subscriptions to multiple people groups, a People Group Editor will only see the subscriptions for people groups they have access to. People Group Editors with no assignments see an empty subscriber list.

## The Roles Tab

The Users page has a Roles tab that lists every role with its description and a matrix of what it can view, create, edit, and delete in each area. Permissions limited to assigned people groups carry a "Scoped" badge, those limited to assigned languages carry a "Language-scoped" badge, and those limited to the user's own conversations carry an "Own conversations" badge. It is the quickest reference when deciding which role to give someone.

## Current Limitations

- The Users list shows people group assignments but not language assignments
- People group access is all-or-nothing; there is no read-only option
- No log of who changed a user's roles or assignments and when
- Superadmin can only be granted in the database
