# Libraries & Content

## Overview

Libraries are reusable collections of prayer content organized by day. Think of a library like a prayer guide booklet—you create it once, then use it across multiple people groups.

The key benefit is that content only needs to be written once. If you have a "40 Days of Prayer" guide, you can use it across multiple people groups, or run it simultaneously in different regions.

## What's in a Library

Each library has a name and description, plus content organized by day number (Day 1, Day 2, etc.). A library can have up to 365 days of content.

Libraries can be marked as **repeating**, which means they cycle back to Day 1 after the last day. This is useful for content that should run continuously without an end date.

Each day can have translations in multiple languages. Languages can be added or removed as needed. You don't need all languages for every day—you can start with one and add translations over time.

## Creating and Managing Content

The Libraries section in the admin shows all libraries with a quick view of how many days have content and which languages are represented.

Inside a library, you see a calendar view of all the days. Days are color-coded: green means all languages are translated, orange means some languages are done, and gray means no content yet. You can filter by language to see which days still need translation work.

Click any day to see all its translations. From there you can add a new translation, edit an existing one, or view what's there. The content editor supports rich formatting including text styles, headings, links, images, and video.

### Bible Verses

The content editor has a dedicated verse block for embedding Bible passages. To insert one, use the "Turn into" menu or the slash command menu and select "Verse." A reference field appears where you type a Bible reference (e.g., "John 3:16" or "Psalm 23:1-6") and press Enter. The system fetches the verse text automatically and displays it in a styled block with the citation.

Verses are fetched from a Bible API in the language matching the content being edited. When you translate content to other languages, you can choose whether to re-fetch verses in the target language's Bible translation or keep the original. If a verse isn't available in a particular language, the system logs a warning so you know which ones need attention.

Each language uses a specific Bible translation — for example, NKJV for English, NVI for Spanish, and LSG for French.

## How Libraries Connect to People Groups

Libraries are assigned to people groups through a row-based system. You can have multiple rows running in parallel, each with its own library.

For example, a people group might have:
- Row 1: "Morning Prayers" library (30 days)
- Row 2: "Evening Reflections" library (30 days)

Both rows run at the same time, so subscribers could receive content from both libraries depending on their preferences.

Within a row, you can chain libraries together. When one finishes, the next begins. This lets you build longer prayer campaigns from smaller library pieces.

## Sharing Content Across People Groups

When you use a library across multiple people groups, they share the same content. Edit a translation in the library, and it updates everywhere that library is used.

This is intentional—it means you maintain content in one place. But it also means you should be careful about editing content in an active library, since changes affect all people groups using it.

## Who Can Do What

Admins can create, edit, and delete libraries. They can also configure which libraries are assigned to people groups.

People Group Editors can create and edit content within libraries, but they cannot create new libraries or change library assignments. This lets content creators focus on writing without needing full admin access.

## Multi-Language Workflow

A typical workflow for translating content:

1. Write the content in your primary language (usually English)
2. View the day to see which languages are missing
3. Add translations one language at a time
4. Use the calendar view filtered by language to track progress

The system shows completion stats so you can see at a glance how much translation work remains.

## Virtual Libraries

In addition to regular libraries that contain authored content, the system has built-in virtual libraries that generate content dynamically:

**People Group** — Displays information about a specific linked people group every day. Used for focused campaigns where subscribers are praying for one group.

**Daily People Group** — Rotates through all people groups in the system, showing a different one each day. Each people group's subscribers see a different rotation based on an offset, ensuring variety. The rotation order is deterministic so everyone sees the same group on the same day.

**Day in the Life** — Displays contextual content about daily life in the region of the people group being prayed for.

Virtual libraries cannot be edited, exported, or imported — their content is generated automatically.

## Current Limitations

- No way to copy content between days or bulk-import translations
- Content cannot be scheduled to appear on specific calendar dates, only day numbers
