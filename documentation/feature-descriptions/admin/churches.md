# Churches

## Overview

The Churches section is a directory of individual local congregations entered by partner denominations: where each congregation meets and how to reach its pastor. It is the fourth record type in the admin area alongside People Groups, Groups, and Contacts, and it shares the same list, detail panel, comments, and activity features.

A church here is **not** the same thing as a Group. Groups represent churches or organizations that have adopted a people group; churches in this section are a standalone directory with no link to groups, adoptions, people groups, or contacts. The two sections use the word "church" for different purposes.

The section is the last item in the admin sidebar, below Onboarding. Only Admins can see it.

## The List

The list shows every church, alphabetically by name. Each row shows the church name, its town and country (or "No location entered"), a location status badge, the congregation size if known, and the language of service if set.

A search box filters the list by church name, town, or pastor name as you type. There are no other filters, sorting options, or pages; the whole directory loads at once.

Three buttons sit in the header: **Map**, **Import CSV**, and **New Church**.

## The Detail Panel

Clicking a church opens a panel on the right. Previous and next arrows step through the list without closing the panel. Every field saves automatically as you leave it; there is no Save button. A small indicator shows "Saving" and then "Saved".

### Church

- **Church name** — required
- **Village / town** — where the church meets
- **Country** — chosen from a searchable list
- **Congregation size** — typical attendance. Free text is tolerated; "about 50" is stored as 50
- **Language of service** — the language the congregation worships in. Type to pick from languages already entered on other churches, or type a new one

### Pastor

- **Pastor name**
- **Pastor phone**
- **Pastor email**

### Location

A small map with a draggable pin, latitude and longitude fields, and two buttons: **Look up from town** and **Remove pin**. See "How Locations Are Found" below.

### Metadata

The church ID and creation date, read-only.

### Activity and comments

Two tabs on the side of the panel show the record's activity log (every field change, with old and new values) and team comments with mentions, exactly as on the other record types.

### Creating a church

**New Church** opens a small modal asking only for the name (required), town, and country. The country is prefilled with the last one you used. The new church opens in the panel immediately so you can fill in the rest.

### Deleting a church

The **Delete** button asks for confirmation and warns that the church and its comments will be removed. Deletion is permanent; there is no archive or undo.

## Importing from CSV

**Import CSV** opens a two-step modal.

**Step 1: choose a file.** Drop or pick a CSV file. The first row must hold the column headers.

**Step 2: map the columns.** The modal shows how many rows were found and lists every column in the file with an example value and a dropdown to choose which church field it fills, or "Skip this column". The importer guesses the mapping from common header names (for example "Church", "Village", "Pastor", "Phone", "Attendance", "Lat"), and you can correct any guess. Exactly one column must be mapped to the church name; everything else is optional. Columns you leave unmapped are ignored.

An optional **Country for rows without one** dropdown fills in the country for rows whose country cell is blank, or for every row if the file has no country column. Churches imported without a country are kept, but their location cannot be looked up.

Click **Import N churches** to run it. When it finishes, a summary shows how many rows were imported, how many are having their location looked up in the background, and a list of skipped rows with the reason (missing name, unrecognised country, or invalid coordinates). Row numbers match the spreadsheet, so "Row 2" is the first data row.

Things to know before importing:

- **Every valid row is inserted.** There is no duplicate check and no way to update existing churches from a file. Importing the same file twice doubles the records.
- A file can hold up to 10,000 rows.
- Rows with problems are skipped and reported; the rest still import.
- Each imported row is recorded in the activity log.

## How Locations Are Found

The map pin for a church comes from one of two places: an automatic lookup based on the town and country, or a person placing it by hand.

### Automatic lookup

When a church has both a town and a country and no pin, it is queued for lookup. The lookup uses OpenStreetMap's Nominatim service and searches for the town within that country. Only settlement-level matches (a city, town, village, hamlet, or neighbourhood) are accepted. A broader match such as a district or state would put the pin somewhere that looks trustworthy but is not, so those are treated as "not found" instead.

The lookup usually completes within a minute. Lookups run one at a time, with at least a second between them, to respect Nominatim's usage policy. After a large import, the queue drains steadily in the background; locating 10,000 churches takes roughly three hours. If Nominatim is unavailable, the queue pauses and retries a minute later.

A lookup runs automatically when:

- A church is created with a town and country
- A church's town or country is changed (unless the pin was placed by hand)
- Churches are imported with a town and country
- You click **Look up from town**, which discards the current pin and searches again

### Placing the pin by hand

Click the small map to drop a pin, or drag an existing pin to correct it. You can also type latitude and longitude directly; both must be given together. A hand-placed pin is never overwritten by an automatic lookup, even if you later change the town. **Remove pin** clears the location and, if the church has a town and country, queues a fresh lookup.

### Location statuses

| Badge | Meaning |
|---|---|
| **Locating…** | Queued for lookup |
| **Located** | Found from the town and country |
| **Set manually** | A person placed the pin |
| **Not found** | The lookup ran but found no matching settlement. Check the spelling or place the pin by hand. This status does not retry on its own |
| **No location** | No town and country to search from, and no pin |

The hint text under the Location heading changes with the status and tells you what to do next.

## The Map

**Map** in the list header opens a full-page map of every church that has a pin. The subtitle shows how many churches are on the map out of the total.

- Each church is a circle sized by congregation size, so larger congregations stand out. Churches with unknown size are drawn as a small congregation rather than disappearing.
- Nearby churches merge into numbered clusters when zoomed out. Clicking a cluster zooms in.
- Hovering a church shows its name, town, pastor, and language. Clicking it opens the church record.
- The map follows the admin light or dark theme.

A **Not on the map** panel beside the map lists every church without a pin, each with its status badge, so you can see which ones are still locating, were not found, or have no location to search from.

The map requires a Mapbox access token to be configured. Without one, the page shows "Map not configured" and the small map in the detail panel is hidden, but the latitude and longitude fields, the lookup button, and the "Not on the map" list still work.

## Design Decisions

**Why a separate record type instead of reusing Groups?** Groups exist to represent adopting churches and organizations and are created from the adoption form. This directory is a partner-supplied list of congregations that may have no adoption relationship at all. Keeping them separate avoids polluting the adoption records.

**Why look up locations in the background?** Saving a church never waits on the geocoding service. The request is queued and processed shortly after, so a single church locates within seconds while a bulk import drains steadily without slowing the app down.

**Why settlement-level matches only?** A confident-looking but wrong pin is worse than "Not found". Rejecting district and country matches means every automatic pin is at least in the right town.

**Why does a hand-placed pin always win?** If a person dragged the pin, they know better than the lookup. Automatic results only apply while the church is still waiting on a lookup, and changing the town of a hand-located church does not re-queue it.

**Why does the import never deduplicate?** Matching rules for congregations (by name? town? pastor?) are unclear and would produce surprising merges. Inserting every row keeps the import predictable; cleanup is left to the admin.

## Current Limitations

- Churches cannot be linked to the group that planted them, the people group they serve, or any contact
- No street address, denomination, service times, or active/inactive status; location is only ever town plus country
- Only Admins can see or edit churches; there is no read-only or regional partner access
- The list has no filters, no sorting options, no pagination, no bulk actions, and no CSV export
- Importing cannot update existing records or detect duplicates, and there is no undo for a mis-mapped import
- No template CSV is provided
- There is no admin view of the lookup queue or its errors; a paused lookup service is only visible in server logs
- "Not found" locations never retry automatically
- Two churches in the same town each cost a separate lookup; results are not shared
- The map has no search, filters, or legend, and there is no fallback map when Mapbox is not configured
