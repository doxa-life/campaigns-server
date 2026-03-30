# People Group Adoption

This system lets churches and individuals formally adopt people groups for prayer, tracks their ongoing engagement through periodic reports, and shows these commitments on people group pages.

## What it does

When a church or individual wants to commit to praying for an unreached people group, they can adopt it through a public form or an admin can create the adoption manually. The system then:

1. Creates a group record (if one doesn't already exist) to represent the adopting church or individual
2. Links the group to the chosen people group as an active adoption
3. Sends a welcome email with resources and next steps
4. Sends monthly email reminders asking for prayer updates
5. Collects reports on how many people are praying and what stories are emerging
6. Makes adoption counts and group names available on people group pages

## Key concepts

### Groups

A group represents a church, organization, or prayer team. Each group has:

- A name (e.g., "First Baptist Church" or the individual's full name if no church is provided)
- A primary contact person
- An optional country
- Any number of linked contacts

Groups are the organizational unit that adopts people groups. One group can adopt multiple people groups, and one people group can be adopted by multiple groups.

### Adoptions

An adoption is the link between a group and a people group. Each adoption has:

- A **status**: pending, active, or inactive
- A **public visibility** setting controlling whether the group's name appears on the people group's public page
- A unique **update link** (magic link) used to submit reports without logging in
- An **adoption date** recorded when the adoption becomes active

A group can only adopt a given people group once — duplicates are prevented.

### Adoption reports

Reports are submitted by the adopting group to share how their prayer commitment is going. Each report can include:

- How many people are currently praying
- Stories or testimonies from prayer times
- Comments or questions for the admin team

Reports go through a review process: they start as "submitted" and an admin can approve or reject them.

## How groups adopt a people group

### Public adoption form

Anyone can adopt a people group by submitting the public adoption form. The form collects:

- First name, last name, and email (required)
- Phone number and role (e.g., pastor, prayer leader) (optional)
- Church or organization name (optional — if not provided, the individual's name is used)
- Country (optional)
- Which people group they want to adopt (required)
- Whether they give permission to be contacted about the people group
- Whether they agree to have their name displayed publicly on the people group page
- Preferred language for communications

When the form is submitted, the system automatically:

1. Finds or creates a subscriber record for the contact
2. Finds or creates a group (matched by name, so returning churches link to their existing group)
3. Connects the subscriber to the group as a champion
4. Grants communication consent based on the submitter's choices
5. **If the email is already verified** (returning user): creates the adoption as active immediately and sends the welcome email
6. **If the email is not yet verified** (new user): creates a pending adoption record, sends a verification email, and only creates the real adoption after the user clicks the verification link

### Admin-created adoptions

Admins can also create adoptions manually:

1. Create or select a group in the admin panel, set a primary contact, and optionally add other contacts
2. Create an adoption from the group page or the people group page, selecting the other side of the link
3. The adoption starts as active by default
4. Toggle "show publicly" to control whether the group's name appears on the people group's public page

## Email verification

New users (with unverified emails) must verify their email before the adoption becomes active. The flow works as follows:

1. User submits the adoption form
2. The system creates a pending adoption record (stored in `pending_adoptions` table) and sends a verification email
3. The verification email contains a link to `/adoption/verify?token=xxx`
4. When the user clicks the link, the system verifies the email, converts all pending adoptions into real active adoptions, and sends the welcome email
5. The verification token expires after 7 days

**Returning users** (those whose email was previously verified through an adoption or subscription) skip verification entirely — their adoption is created immediately.

**Cross-flow verification**: If a user adopts a people group (creating a pending adoption) and then subscribes to prayer reminders and verifies through the subscription flow, the subscription verification endpoint also processes any pending adoptions for that contact method.

**Duplicate submissions**: If the same group submits the adoption form again before verifying, the pending record is updated and a new verification token is issued. The previous token becomes invalid.

## Welcome email

When someone adopts through the public form, they receive a welcome email that includes:

- A link to the people group's profile page on the site
- Links to external resources (Joshua Project and Peoplegroups.org, when available)
- A link to the people group's research and resources page on doxa.life
- A three-step getting started guide: get to know the people group, find prayer materials, and send regular updates
- Contact information for the team
- A count showing how many people groups still need to be adopted (e.g., "Before you, there were 342 groups without a prayer champion. Now there are 341.")

The email is translated into the submitter's preferred language and supports right-to-left layout for Arabic.

## How update reports are collected

### Monthly automated reminders (currently disabled)

The system is designed to automatically email the primary contact of every group with active adoptions on the 1st of each month. The email lists all of the group's adopted people groups, each with its own "Submit Update" link. This scheduler is currently disabled while the adoption system matures.

### Manual reminders

Admins can also send a reminder email manually from the adoption detail panel at any time. This is useful for following up outside the monthly cycle.

### The update form

When someone clicks the update link (from either an automated or manual email), they see a simple form asking:

- How many people are praying?
- Any stories from prayer times?
- Any comments or questions?

The form does not require logging in — the unique link serves as authentication. After submitting, they see a confirmation with the group and people group names.

## What the public sees

The people group detail API provides adoption data to public pages:

- How many churches/organizations have adopted the people group (count of active adoptions)
- The names of adopting groups (only those marked as publicly visible and with an active adoption)

However, the public people group pages do not yet display this information in the interface.

## Admin management

### Dashboard

The admin dashboard shows an overview of adoption coverage: how many people groups have been adopted versus how many have not.

### Groups page

The admin groups page shows all groups with their adoption and contact counts. Selecting a group reveals:

- **Group details** — Edit the name, primary contact, and country
- **Contacts** — Add or remove subscribers linked to the group
- **Adoptions** — View all adoptions with status badges, add new adoptions

### People groups page

The admin people groups page also shows adoption information. Selecting a people group reveals an "Adopted By" section listing all groups that have adopted it, with the ability to add new adoptions from this side as well.

### Adoption detail panel

Clicking an adoption (from either the groups page or people groups page) opens a detail panel where admins can:

- See links to both the group and the people group
- Change the adoption status (pending, active, inactive)
- Toggle public visibility
- See the adoption date
- Copy the update link to share manually
- Send a reminder email to the primary contact
- View submitted reports and approve or reject them
- Delete the adoption or mark it inactive to preserve history

When deleting, the system suggests making the adoption inactive instead and requires confirmation for permanent removal.

### Deleting a group

Deleting a group removes all of its adoptions and their associated reports. The system warns the admin before proceeding.

## Key decisions

**Why use groups instead of linking adoptions directly to subscribers?**
A church adoption is an organizational commitment, not an individual one. The primary contact may change over time, but the adoption belongs to the group. Multiple contacts can be associated with a group for administrative purposes.

**Why magic links instead of requiring login?**
The people submitting updates (church leaders, prayer coordinators) may not have accounts in the system. Magic links make it frictionless — click the link in the email, fill out the form, done.

**Why review reports before publishing?**
Reports may eventually be displayed publicly or shared with stakeholders. Having a review step ensures quality and appropriateness before anything is shared.

**Why "inactive" instead of just deleting adoptions?**
Making an adoption inactive preserves the history of reports and the relationship. This is useful for tracking long-term engagement even if a group pauses their commitment.

**Why find-or-create for groups on the public form?**
If a church submits the adoption form for a second people group, the system matches them to their existing group by name rather than creating a duplicate. This keeps all of a church's adoptions together.

## Current limitations

- Only the primary contact receives reminder emails — other group contacts are not included
- There is no way to customize the reminder email content per group or per people group
- Adoption reports are collected but not yet displayed publicly anywhere
- The public people group pages do not yet render adoption counts or group names, even though the data is available
- No bulk operations for managing adoptions across multiple groups
- The monthly automated reminder scheduler is currently disabled; admins can still send reminders manually
- No tracking of whether reminder emails are opened or update links are clicked
- The public form group matching is name-based, so slight variations in church name (e.g., "First Baptist" vs "First Baptist Church") would create separate groups
