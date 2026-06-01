# Permissions System

## Overview

The permissions system controls what logged-in users can see and do. Users are assigned a role that determines their level of access.

## Roles

**Admin** has full access to everything. They can manage all people groups, all content, invite users, and assign roles. They see the complete admin interface including Libraries, People Group Config, and Users sections.

**People Group Editor** can create and manage content, but only within people groups they've been granted access to. They can also view and manage subscribers who are subscribed to their people groups. They cannot see other people groups, manage users, or access system settings.

**No Role** is the default for new users. They can log in but see a "Pending Approval" page with no admin capabilities until an admin assigns them a role. Users who registered via invitation may already have a role pre-assigned.

**Superadmin** is a separate designation layered on top of the regular role system. It is not a role itself — it's a flag that can be added to any user. Superadmins have access to system-level operations like manual backups, bulk translations, notification recipient configuration, and diagnostics.

## Granting Access

When you add someone as a People Group Editor, they won't see any people groups until you explicitly grant them access. This lets you control exactly what each person can work on.

Admins see all people groups automatically and don't need individual people group assignments.

To set up a new team member:

1. Invite them from the Users page (you can assign their role during invitation)
2. Once they register, assign their role if you didn't during invitation
3. For People Group Editors, click their people group access button and select which people groups they should see

## Choosing the Right Role

Give someone **Admin** if they need to:
- See and manage all people groups
- Invite and manage other users
- Access Libraries or People Group Config

Give someone **People Group Editor** if they:
- Only need to work on specific people groups
- Shouldn't see other teams' people groups
- Don't need to manage users or system settings

## Subscriber Access

People Group Editors can see and manage subscribers who have subscriptions to their assigned people groups:

- **View**: See subscriber details, contact info, and subscription settings
- **Edit**: Update subscriber names and subscription settings (frequency, time, timezone)
- **Delete**: Remove subscriptions from their people groups
- **Activity**: View subscriber activity logs and email history
- **Send Reminders**: Manually send prayer reminder emails

If a subscriber has subscriptions to multiple people groups, a People Group Editor will only see the subscriptions for people groups they have access to.

People Group Editors with no people group assignments will see an empty subscriber list.

## Current Limitations

- Users can only have one role
- Campaign access is all-or-nothing (no read-only option)
- No log of who changed permissions when
