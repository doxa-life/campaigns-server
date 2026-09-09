# Prayer Content Page

## Overview

The prayer content page is where subscribers go to pray. They reach it by clicking the link in their reminder email or from the "Start Praying" button after signing up. It shows the day's prayer content and tracks their prayer activity.

## Page Layout

**Date navigation** — The current date is shown at the top with arrows to browse previous days. You cannot navigate to future dates.

**People praying with you** — Under the date, a line such as "12 people praying with you now" shows how many people are praying on the platform at that moment. See below for how it is counted.

**Prayer content** — The main body displays content from the libraries assigned to the people group. Each section has a title and rich text content (scripture, prayer points, reflections). Sections end with a "Pause and Pray" prompt encouraging the reader to stop and pray before continuing.

Content types that may appear:

- **People Group card** — Information about a featured people group, including image, name, country, population, language, religion, and an interactive map.
- **Day in the Life** — The day's prompt from the people group's own 365-day Day in the Life library, pairing a detail of the group's daily life with something to pray.
- **Scripture** — Bible verses displayed in a highlighted block.
- **Prayer points** — Guided prompts for prayer.

If no content has been created for the current day, a message indicates that no prayer content is available.

## The "I Prayed" Button

A prominent button at the bottom of the page. When clicked, it records the time spent on the page as a prayer session and changes to show a thank-you message. The button is disabled after clicking to prevent duplicate entries.

Prayer time is also saved automatically in the background while the visitor is on the page, so even if they close the tab without clicking the button, their time is captured. See the [Prayer Tracking](../subscribers/prayer-tracking.md) documentation for details on how this works.

## Past Prayers

Below the main content, a row of date buttons shows the previous 7 days. Clicking any date loads that day's prayer content, allowing subscribers to catch up on days they missed.

## People Praying With You Now

The count is site-wide: it includes everyone with a prayer content page open anywhere on the platform, for any people group, on the web or in the mobile app, whether or not they are a known subscriber. A person is counted while their page has reported activity in the last five minutes. Because the page reports automatically for the first fifteen minutes, someone who stays longer drops out of the count after that, and someone who leaves is still counted for up to five minutes.

The figure is a snapshot that can be up to five minutes old and does not refresh while the page is open. The viewer is not subtracted from it. When nobody is praying, or the figure cannot be loaded, the line is hidden rather than showing zero.

## Current Limitations

- No way to view content more than 7 days in the past from the page itself
- Content language is determined by the site language setting, not the subscriber's preference
- The "praying with you" count is global, not specific to the people group being prayed for
