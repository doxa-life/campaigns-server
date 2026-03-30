# User Management

## Overview

User management is where administrators control who can access the admin area and what they can do. You can invite new team members, assign roles, and control which people groups each person can work on.

People can join the system in two ways: self-registration or invitation. Self-registered users start with no role and must wait for an admin to grant them access. Invited users can have a role pre-assigned, giving them immediate access when they create their account.

## The Users Page

The Users page in the admin area shows two sections:

**Active Users** lists everyone who has accepted an invitation and created an account. For each user you can see their email, display name, current role, whether their email is verified, and when they joined.

**Invitations** lists all invitations that have been sent, whether pending, accepted, expired, or revoked. You can see who was invited, the inviter's name, the invitation status, and when it expires.

## Inviting New Users

### Sending an Invitation

Click the "Invite User" button to open the invitation form. Enter the person's email address and optionally select a role to assign them.

If you assign a role during invitation, the person will have that role immediately when they create their account. If you leave it blank, they'll have no role initially and you can assign one after they join.

When you send the invitation, the person receives an email with a link to create their account. The link expires after seven days.

### What the Invitee Sees

The invitation email includes:
- Who invited them (your name)
- A prominent button to accept the invitation
- The expiration date
- A fallback link they can copy if the button doesn't work

When they click the link, they land on a page where they:
1. See their email address (pre-filled from the invitation)
2. Choose a display name
3. Set a password
4. Submit to create their account

After creating their account, they're automatically logged in and taken to the admin dashboard.

### Managing Invitations

From the Invitations section, you can:

**Resend** - Send another invitation email if the person didn't receive the first one or lost it. Only works for pending invitations that haven't expired.

**Revoke** - Cancel an invitation so it can no longer be used. Use this if you invited the wrong person or they no longer need access.

Expired invitations remain visible but can't be resent. If someone's invitation expired, send them a new one.

## Assigning Roles

Each user can have one role that determines their level of access:

**Admin** - Full access to everything. Admins can manage all people groups, all content, all users, and system settings.

**People Group Editor** - Limited access to specific people groups. People Group Editors can create and edit content, but only within people groups they've been granted access to. They cannot manage users or see other people groups.

**No Role** - The user can log in but has no admin capabilities. This is useful as a temporary state while deciding what access someone should have.

### Changing a User's Role

In the Active Users table, each user has a role dropdown. Click it to change their role immediately. The change takes effect on their next page load.

When you change someone from Admin to People Group Editor, they'll lose access to everything until you grant them specific people group access.

When you change someone from People Group Editor to Admin, they gain access to everything and their people-group-specific assignments become irrelevant.

## People Group Access

People Group Editors need explicit access to each people group they should work on. Without any people group assignments, they'll see an empty admin area.

### Granting People Group Access

In the Active Users table, People Group Editors have a "Manage" button in the people groups column. Click it to open the people group access dialog.

The dialog shows checkboxes for every people group in the system. Check the people groups this person should have access to, then save. They can now view and edit content for those people groups.

### How Access Works

- People Group Editors only see people groups they have access to in the admin navigation
- They can only view subscribers who are subscribed to their assigned people groups
- They can create and edit content in their assigned people groups' libraries
- They cannot see or affect anything related to people groups they don't have access to

Admins automatically have access to all people groups and don't need individual assignments.

## User Verification

Users who join through invitations are automatically verified—they don't need to click a verification link in a separate email. The invitation acceptance process serves as verification.

Users who self-register must verify their email address by clicking a link sent to them. Until they verify, they cannot access the admin area. The verification status badge in the users table shows whether each user's email has been confirmed.

## Design Decisions

**Two paths to join** - Self-registration lets interested people request access without bothering an admin, while invitations let admins proactively bring specific people on board with pre-configured access. Self-registered users start with no role, so admins maintain control over who actually gets access.

**Role assignment at invitation time** - Letting you assign a role during invitation streamlines onboarding. The invited user has appropriate access from the moment they create their account, rather than starting with no access and waiting for an admin to notice.

**Seven-day expiration** - Invitations expire to prevent stale links from being used long after they were sent. A week gives people reasonable time to accept while limiting the window for misuse.

**Auto-verification for invitees** - Since the invitation email proves the person controls that email address, we skip the redundant verification step. This reduces friction for new team members.

**Granular people group access** - Rather than all-or-nothing access, People Group Editors can be assigned to specific people groups. This lets you have regional editors, language-specific editors, or people-group-specific teams without exposing everyone's work to everyone else.

## Self-Registered Users

When someone registers on their own, they create an account with an email and password, then must verify their email address. Once verified, they can log in but have no role—they'll see a message that their account is pending approval.

These users appear in the Active Users list where an admin can assign them a role. Until a role is assigned, they cannot access any admin features.

This approach lets people express interest in joining without requiring an admin to initiate every registration, while still keeping access under admin control.

## Current Limitations

- Cannot bulk-invite multiple users at once
- No way to transfer ownership of invitations if the original inviter leaves
- Cannot see a history of role changes for a user
- No option to set custom expiration times for invitations
- Cannot re-invite someone whose previous invitation was accepted (would need to create a new account)
- No way to temporarily disable a user without removing their role
- No notification when new users self-register and need role assignment
