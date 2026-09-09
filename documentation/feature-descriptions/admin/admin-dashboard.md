# Admin Dashboard

## Overview

The admin dashboard is the landing page when you log into the admin area. It provides quick navigation to the main sections and an at-a-glance view of platform health through statistics, charts, and a map.

## Quick Navigation

The top of the dashboard shows links to People Groups, Contacts, Groups, Libraries, Users, and Profile. Links are filtered by permission, so most users see fewer than six.

## Statistics

The dashboard has four tabs: **General**, **Prayer**, **Subscribers**, and **Map**.

### General Tab

**Three overview charts** show high-level coverage:

- **People Groups with Prayer** — how many people groups have active prayer campaigns versus those without
- **People Group Adoption** — how many groups have been adopted versus unadopted
- **People Group Engagement** — how many groups are actively engaged versus unengaged

**Five metric cards**:

- **People Signed Up to Pray** — distinct people with an active subscription
- **Total Prayer Time Committed** — the sum of all active subscribers' pledged prayer durations
- **Daily Prayer Time Committed** — committed time expressed as a daily average
- **Total Prayer Time Recorded** — actual prayer time logged across all groups
- **Last 24h Prayer Time Recorded** — recent prayer activity

**Signups by Language** — a bar per language showing how many active subscribers prefer it.

**Signups by Source** — a bar per campaign source (the "utm_source" value captured at signup), counting every signup regardless of its current status. A later unsubscribe does not undo the fact that the source produced it. See [People Group Signup](../subscribers/people-group-signup.md) for how sources are captured.

### Prayer Tab

**Three cards** at the top:

- **Signed Up to Pray Daily** — the number of daily subscribers, with the percentage who actually showed up each day over the last 30 days
- **Signed Up to Pray Weekly** — the number of weekly subscribers, with the percentage who showed up each week over the last 4 weeks
- **Praying: Tracked vs. Anonymous** — of the unique people who prayed in the last 30 days, how many could be matched to a subscriber (they arrived through a reminder email link) versus how many could not. Tracked is a floor: a subscriber praying on a device without that link counts as anonymous

Show-up rates only count periods after each person signed up, so recent subscribers are not penalised for days before they committed.

**Three charts** over the **last 30 days**:

- **Unique People Praying** — daily bars comparing people signed up against people who prayed
- **Daily Prayer Time** — committed minutes against recorded minutes each day
- **Prayer Commitments by People Group** — one bar per people group, scrollable, showing how many commitments each has

Hovering over any bar shows the exact value and date.

### Subscribers Tab

**Three metric cards**: **All Time Subscribers**, **Total Inactive**, and **Total Unsubscribes**.

- **Languages** — a pie chart of active subscribers by preferred language, with counts and percentages
- **Length of Commitment** — bars by chosen prayer duration
- **Prayer Commitment Time of Day** — a histogram of reminder times in each subscriber's local time, in five-minute buckets, and a second histogram normalised to UTC
- **Daily Subscribes vs. Unsubscribes** — paired bars for each of the last 30 days

### Map Tab

**Where People Are Praying** shades each country by how many distinct people prayed from it in the chosen window. Buttons switch between **24h**, **7 days** (the default), **30 days**, and **All time**. The card header shows how many people were located. Hovering a country shows its name and count. The map follows the light or dark admin theme.

Locations come from the network connection when someone opens a prayer content page, as reported by the CDN in front of the site. Only the country is used for the map. Coordinates are stored rounded to roughly eleven kilometres so they identify an area, not a person. Shading is relative to the busiest country in the current window, so intensity is not comparable between windows.

The map and its data load the first time the tab is opened. It requires a Mapbox access token; without one the tab shows "Map not configured". The count is site-wide even for users whose people group access is scoped.

## Current Limitations

- Stats are read-only, with no drill-down into individual people groups from the charts
- Prayer and Subscribers charts are fixed to a 30-day window; only the Map has a time selector
- No way to export dashboard data
- The map only locates people when the CDN supplies location headers, so local or direct-to-server traffic is not counted
- There is no legend for the map shading
