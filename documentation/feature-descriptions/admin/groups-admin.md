# Groups Admin Page

## Overview

The groups admin page is where you manage churches, organizations, and prayer teams that have adopted people groups. It follows the same list-and-detail layout as the other admin pages.

## The List

Each group in the list shows:

- **Name**
- **Primary contact** — The name of the group's main contact person, or "No primary contact" if none is set
- **Adoption count** — A badge showing how many people groups this group has adopted
- **Contact count** — A badge showing how many contacts are linked to the group
- **Created date**

You can search by group name. A "New Group" button in the page header lets you create a new group by entering a name.

## The Detail Panel

Clicking a group opens its detail panel with the following sections:

### Group information

- **Name** — The group's display name (required)
- **Primary contact** — A dropdown to select which of the group's contacts is the main point of contact
- **Country** — A searchable dropdown

### Contacts

Lists all subscribers linked to this group. Each contact shows their name (as a clickable link to their subscriber record) and email. You can remove contacts with the X button, or add new ones by clicking "+ Add" and selecting from a dropdown of existing subscribers.

### Adoptions

Lists all people groups this group has adopted, each shown as a card. You can add new adoptions by clicking "+ Add" and selecting a people group.

Clicking an adoption card opens the adoption detail panel where you can manage status, visibility, send reminders, and review reports. See [People Group Adoption](../adoption/adoption.md) for details.

### Metadata

Read-only information: the group's system ID and creation date.

### Activity and comments

Two tabs on the right side:

- **Activity** — A log of all changes to this group record
- **Comments** — Team notes and discussion (see [Comments & Mentions](comments-and-mentions.md))

### Deleting a group

The delete button opens a confirmation dialog warning that all connections and adoptions for this group will be permanently removed.

## Current Limitations

- No way to merge duplicate groups
- Group matching on the public adoption form is name-based, so slight variations (e.g., "First Baptist" vs "First Baptist Church") create separate groups
