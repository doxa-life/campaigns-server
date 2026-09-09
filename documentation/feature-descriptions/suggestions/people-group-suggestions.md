# People Group Suggestions

This system lets field partners tell us when a people group's information is wrong, when a group should come off the prayer list, or when a group is missing from it. Every suggestion becomes a report that DOXA staff review before anything changes.

## What it does

Our people group list mirrors the unengaged subset of IMB's peoplegroups.org data. Partners on the ground often know things that dataset does not yet reflect: a group has become engaged, a population figure is out of date, a group has been reclassified, or a group exists that is not in any database. The suggestion system gives them a public form to report this, holds their submission until their email is confirmed, routes it to two designated approvers, and applies the change to the people group only after both have approved.

There are two entry points:

- **The public form** at `/updates` on pray.doxa.life, for partners. It is not linked from anywhere on the site; partners are given the address directly.
- **The New Report button** on the admin People Group Reports page, for staff entering a report they received some other way.

## The public form

### Finding the people group

The form opens with a single search box. After two characters, it searches our own list and the IMB and Joshua Project databases at the same time. Results appear in two colour-coded sections so they cannot be mistaken for one list: **On our list** in DOXA green, and **IMB / Joshua Project** in beige.

Our results show the country and, where the group was found through an old or alternate name, "also known as". External results show whether the group is indigenous or diaspora, and carry an "Already on our list" badge when we have them. Choosing an external result we already have simply routes into the update flow for our record rather than creating a duplicate.

If nothing matches, the partner can choose "Tell us about a new people group" and enter the details by hand.

### Choosing what to do

Selecting a group from our list asks what the partner wants to do: **Update their information** or **Request removal**. Selecting an external or hand-entered group goes straight into the flow to add a new group. A progress stepper shows the remaining steps, and the selected group stays pinned at the top with a **Change** button to go back to search.

### Adding a group: the eligibility gate

Before any details are typed, the add flow explains who can be on the DOXA list: groups indigenous to their country rather than diaspora, unengaged with no church-planting work underway, whose primary religion is not Christian and who have not historically been considered Christian.

For an IMB group that our filter currently excludes, the form lists the specific reasons (listed as engaged, a GSEC score above 2, a Christian religious background, or classified as diaspora) and invites the partner to correct whatever is out of date. For an IMB group that already meets the criteria, it notes that confirming the details will help us add them quickly.

The partner then chooses the group's engagement status. Choosing **Engaged** blocks the submission with a clear message: the list focuses on unengaged groups, so an engaged group is out of scope. If they believe the engagement record is wrong, they choose Unengaged and explain in the comments.

### The details

Depending on the flow, the partner sees some or all of these:

- **Engagement status** and three engagement criteria questions: whether cross-cultural workers live among the group, whether they work in the local language and culture, and whether their work will lead to an indigenous church
- **Details**: name, population, country, indigenous or diaspora, coordinates, primary language, primary religion, and a photo
- **Resources available**: Bible translation, Jesus film, radio broadcast, gospel recordings, audio scripture, and Bible stories, each yes or no

In the update flow, each field shows the **Current** value beside a **Suggested** value, and the partner fills in only what should change. Yes/no fields are toggle pairs; clicking the active side again clears the suggestion back to "no change".

For a new group found in IMB or Joshua Project, the form is prefilled from that record, including the photo, which the partner can replace. Christian religions are hidden from the religion picker in the add flow.

Photos can be JPEG, PNG, GIF, or WebP up to 10 MB. They are stored privately and only become public if the suggestion is applied.

### Requesting removal

The partner picks one reason: the group no longer exists, has been assimilated into another group, has been reclassified as diaspora, or has been reclassified as having a Christian background. They can optionally also correct the group's information in the same submission.

### Comments and identity

A comments box asks how the partner is connected to the group and how they learned the information. Comments are required when adding or removing a group and optional for updates.

The final step asks for the partner's name, organization, and email. It also requires an **independent verifier**: a team member, field leader, or organizational representative with firsthand knowledge of the people group, other than the submitter. The verifier's name, organization, and email are recorded and shown to reviewers. The verifier is not contacted by the system.

A bot check protects the form, and each visitor is limited to ten submissions and ten photo uploads per hour.

### After submitting

If the partner's email address has been verified before (through this form or any other DOXA flow), the suggestion goes straight to the review queue and the partner is thanked and told they will hear back once a decision is made.

Otherwise the form says "Almost done — please check your email" and sends a confirmation link. The suggestion is held in an **awaiting verification** state and does not reach reviewers until the link is clicked. The link is valid for seven days, and the same link is reused for any further submissions from that address during that time. Clicking it returns the partner to the form with a confirmation banner and releases every held suggestion from that address into the queue.

## Review and approval

### Who reviews

Reviewing requires permission to edit people groups; today that is Admins and Progress Admins. Public suggestions additionally require **two designated approvers**, configured by an Admin through the **Approvers** button on the reports page. Both approvers must approve before a public suggestion can be applied, and either one can deny it alone. The detail panel warns when fewer than two approvers are configured.

When a suggestion enters the queue, both approvers receive an email describing the type of suggestion, the group, who submitted it, and their comments, with a **Review Suggestion** button that opens the report directly.

### Statuses

| Status | Meaning |
|---|---|
| **Awaiting verification** | Public submission held until the reporter confirms their email |
| **Pending** | In the queue for review |
| **Approved** | Both approvers have approved, but the change has not yet been applied |
| **Accepted** | The change has been applied to the people group |
| **Denied** | Rejected; nothing was changed |

Public suggestions move through all five. Admin-entered reports skip verification and approval: a single reviewer accepts or denies them directly.

### Approve versus apply

These are deliberately separate. **Approve** records one approver's vote and changes nothing. Once both distinct approvers have voted, the report becomes Approved. **Apply** is a second, explicit action that writes the change into the people group. This keeps the decision and the data change visibly distinct and gives the second approver a moment to look before anything is committed.

### What happens when a suggestion is applied

- **Updates** write the suggested values onto the people group. If the change marks a group as engaged, the reason is recorded as verified through DOXA's own review, and the group's page shows the engagement.
- **New groups** are created as active people groups with the suggested details. The photo, whether uploaded or captured from IMB or Joshua Project, is copied onto DOXA's own storage.
- **Removals** archive the group with the reason given. The group is not deleted, so its history remains.

The people group's activity log records the change with a "Report Update" badge, the reporter's name, and a link to the report. That badge matters: the IMB update tooling treats such edits as manual and leaves those fields alone on future IMB refreshes, so field-verified changes are not overwritten.

The report keeps a snapshot of the previous values, so its detail view later shows "Was" and "Applied" side by side.

### Emails to the reporter

Public reporters are emailed when their suggestion is applied or denied. The email states the outcome only; reviewer comments and notes are never shared. People who submitted through an admin-entered report are not emailed.

## The admin page

**People Group Reports** is reached from the **Reports** button on the People Groups page. It lists every report with the group name, status badge, a type badge for add and remove reports, a "public" badge for suggestions from the form, and a "Not in system" badge when the report is about a group we do not have. A search box and a status filter narrow the list.

Selecting a report opens a detail panel showing:

- **Report info**: reporter, organization, email, verifier and their organization and email, submission and review dates
- **Suggested changes**: one card per field with the current and proposed values side by side
- **Suggested picture**, if one was uploaded
- **Notes**: the submitter's comments
- **Approvals** (public reports): which approvers have voted and when
- **Actions**: Approve, Apply, Deny, and Delete for public reports (Approve, Apply, and Deny appear only for designated approvers); Accept or Link, Deny, and Delete for admin-entered reports

Every report has a Comments tab for internal discussion, with @-mentions that email the mentioned team member a link to the report. Comments are internal and are removed if the report is deleted.

### Entering a report by hand

**New Report** opens a form for staff. It can be filled in manually, or a written report from the field can be pasted into a box and parsed by AI, which extracts the group name, reporter details, notes, and a set of engagement and population fields and matches the group to our list. The pasted text is kept as a comment on the report for reference.

If the group is not in our system yet, a switch lets staff enter its name and any known identifier instead. Such a report can later be **linked** to an existing people group and then accepted; it cannot create a new group. Genuinely new groups come in through the public form or the IMB import.

Admin-entered reports can suggest any people group field, not just the ones exposed on the public form.

## External data

**IMB.** A local copy of the peoplegroups.org dataset refreshes automatically every Monday. It powers the search and prefills new-group suggestions. This copy is separate from the periodic bulk update of our own people group records, which is a manual process.

**Joshua Project.** Their database has no name search, so the full dataset is downloaded and searched locally. It is cached for a day and reloaded at startup so results are available quickly. Joshua Project groups are matched to ours by both their ID and country, because a single Joshua Project ID can span several countries. Their religion labels use a different scheme from IMB's, so the religion is shown as a hint rather than prefilled.

## Key decisions

**Why require two approvers and then a separate apply step?** Public suggestions come from outside the team and can add, change, or archive a group. Two approvals guard against a single misjudgement, and the separate apply step makes the final change deliberate rather than a side effect of the second vote. Denial only needs one approver because a single well-founded objection should be enough to stop a change.

**Why the eligibility gate before any typing?** Partner review showed people entering full details for engaged groups that could never be added. Asking about engagement first stops those submissions before any effort is wasted.

**Why an independent verifier?** Each change should be substantiated by a second person with firsthand knowledge. Capturing their details gives reviewers someone to check with, even though the system itself does not contact them yet.

**Why search all three sources at once?** Partners rarely know which database a group is in. One search that shows our list and the external lists in distinct colours makes it obvious whether to update, remove, or add.

**Why keep photos private until applied?** Uploads are unreviewed content from the public. They are only copied to public storage once a suggestion has been approved and applied.

**Why archive instead of delete on removal?** Archiving keeps the group's subscribers, activity, and history intact while taking it off the list, and it can be reversed.

**Why hold suggestions until the email is confirmed?** It stops the review queue filling with unverifiable submissions and gives reviewers a working address for the outcome email.

## Current limitations

- Reviewers cannot edit a suggestion before applying it; the only options are approve, apply, deny, or delete
- Nothing is sent to the verifier, so the second-person check is manual
- No reason is recorded when a suggestion is denied, and the reporter is only told it was not applied
- The second approver is not notified when the first approval lands; only the initial queue email is sent
- Admin-entered reports for groups not in the system can only be linked to an existing group, never used to create one
- The admin list loads every report at once with no paging, which will slow down as the queue grows
- Any reviewer with edit permission can delete a report at any status, including accepted ones
- Joshua Project results depend on an API key and a warmed cache; without them the search quietly shows IMB results only
- The AI report parser extracts a fixed set of fields; anything else in a pasted report survives only as notes
- Photos from denied or deleted suggestions are never cleaned up from storage
- The public form is not linked from the site, so partners must be given the address
