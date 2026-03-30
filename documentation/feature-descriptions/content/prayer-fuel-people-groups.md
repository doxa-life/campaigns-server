# Prayer Fuel: People Groups

## Overview

Prayer Fuel can display two types of people group content alongside regular prayer content. These are "virtual libraries"—they don't contain pre-written content like regular libraries. Instead, they pull information dynamically from the people groups in the system.

This lets people groups include people group information without manually creating content for each one.

## The Two Virtual Libraries

### People Group (Campaign's Linked Group)

Each people group can be linked to a specific people group. When this virtual library is added to the prayer fuel order, it displays that people group's linked people group every day.

For example, if a people group is focused on praying for the Berber people of Morocco, adding this library shows the Berber people group card on every day's prayer fuel.

This is useful for people groups dedicated to a single people group, keeping the focus consistent.

### Daily People Group (Rotating)

This virtual library shows a different people group each day, rotating through all people groups in the system. The key features:

**Different for each people group** - Each people group sees a different people group on the same day. This spreads prayer coverage across all people groups rather than everyone praying for the same one.

**Deterministic rotation** - The order is shuffled but fixed. On Day 1, Campaign A might see People Group 47 while Campaign B sees People Group 82. On Day 2, they each advance to the next in their sequence.

**Complete coverage** - Every people group gets shown before any repeats. If there are 100 people groups, it takes 100 days to cycle through all of them.

**No duplicates within a people group** - The daily people group is always different from the people group's linked people group (they're offset in the rotation).

When displayed, this library shows a "People Group of the Day" title above the people group card to distinguish it from the people group's main people group.

## What Users See

Both virtual libraries display a people group card showing:
- Name of the people group
- Population estimate
- Primary language
- Primary religion
- A map showing the group's location
- Description or prayer focus (when available)

The card format is the same for both libraries—only the selection logic differs.

## How to Use

In the Prayer Fuel Order admin page, these virtual libraries appear alongside regular content libraries. You can:

- Add just the people group's people group for focused people groups
- Add just the daily rotating people group for variety
- Add both to show the people group's focus group plus introduce subscribers to other unreached peoples
- Position them anywhere in the content order

Like other libraries in the prayer fuel order, these display indefinitely—they don't "run out" of content.

## How the Rotation Works

Each people group has a randomly-assigned order number. This number was set once when the feature was created and doesn't change.

The daily people group calculation:
1. Take the current day number (days since the people group start date)
2. Add an offset based on the people group's linked people group
3. Find the people group at that position in the shuffled order

Because each people group has a different offset (based on their linked people group), different people groups see different people groups on the same day.

## Design Decisions

**Offset by people group's people group** - Using the people group's linked people group as an offset ensures natural distribution. Campaigns focused on different regions will see different daily people groups.

**Pre-shuffled order** - Rather than calculating a random order each time, the order is fixed. This ensures consistency—if you view yesterday's prayer fuel, you see the same people group you would have seen yesterday.

**No administrative control over rotation** - The order is automatic. Admins cannot pick which people group appears on which day. This keeps things simple and ensures fair coverage.

**"People Group of the Day" title** - The daily group shows this title to distinguish it from the people group's main people group. Without this, seeing two people group cards could be confusing.

## Current Limitations

- Cannot manually select which people group appears on a specific day
- The rotation order cannot be changed without a system update
- If new people groups are added, they get assigned new order numbers but won't appear in the rotation until their number comes up
- No way to exclude specific people groups from the rotation
- Both people groups use the same card design—no way to customize appearance for the daily one
