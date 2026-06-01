# Prayer Tracking

## Overview

The prayer tracking system records when people pray and how long they spend praying. This data shows community engagement—how many people are praying and how much total prayer time is being accumulated across people groups.

## How Prayer Time Is Captured

### The "I Prayed" Button

When someone visits the prayer content page and clicks "I Prayed," the system records how long they spent on the page, up to a maximum of 2 hours. This cap prevents over-counting if someone leaves the page open and returns much later. The button changes to show their prayer was recorded, along with a thank you message.

### Automatic Saving

Not everyone remembers to click the button. To capture prayer time even when people forget, the system automatically saves in the background while someone is on the prayer page. It records an initial visit immediately, then saves again at 30 seconds and 1 minute, and then every minute after that up to 15 minutes.

If the person clicks "I Prayed" at any point, automatic saving stops and their actual time is recorded.

This means even if someone prays for 12 minutes and closes the tab without clicking anything, the system will have captured 12 minutes of their prayer time from the automatic saves.

## Who Gets Credit

People who arrive at the prayer page through a link in their reminder email are identified automatically. Their prayer activity is connected to their subscriber record.

People who visit the prayer page directly (without coming through an email link) are tracked using their browser's local storage. The first time they visit, a unique anonymous ID is created and stored. When they return on subsequent days, they're recognized as the same person.

This means an anonymous user who prays every day for a week counts as 1 person, not 7. However, if they use a different browser or device, or clear their browser data, they'll be assigned a new ID.

## People Group Statistics

People groups display two types of metrics: **commitment stats** (who signed up) and **activity stats** (who actually prayed).

### Commitment Stats

These show what people have pledged by signing up for prayer reminders.

#### People Committed

This counts active subscriptions—people who signed up to receive prayer reminders and haven't unsubscribed. Each subscription represents someone who committed to pray regularly for this people group.

#### Committed Duration

This shows the total daily prayer time pledged by all active subscribers combined. When someone signs up, they choose how long they'll pray (e.g., 10 minutes). This metric sums all those commitments.

For example, if 5 people each committed to pray 10 minutes daily, this shows "50m pledged."

### Activity Stats

These show actual prayer activity recorded over the past 7 days:

#### People Praying

This shows the average number of unique people praying per day over the last 7 days. It counts people, not prayer sessions—if someone prays twice in one day, they're only counted once. Days with no activity count as zero in the average.

For example, if 5 people prayed on Monday and 5 on Tuesday (and no other days this week), this shows "1 praying"—the total across 2 days averaged over all 7.

Anonymous visitors are tracked via browser storage, so the same anonymous person returning multiple days is counted as one person, not multiple.

#### Daily Prayer Time

This shows the average daily prayer time over the last 7 days. It takes the total prayer time from the past week and divides by 7.

This is a true average—if no one prays for 3 days, those zeros are factored in. A people group with 70 minutes of prayer this week shows "10m daily" regardless of whether that came from 7 days of 10-minute sessions or one day with 70 minutes.

Both activity metrics use the same 7-day average approach—total divided by 7, regardless of how many days had activity.

The time is displayed in hours and minutes. For example, "2h 30m daily" means the people group averages 150 minutes of prayer per day.

### Commitment vs Activity

These two stat types answer different questions:

- **Commitment**: "How many people signed up to pray?" — Shows potential and community size
- **Activity**: "How many people actually prayed?" — Shows engagement and follow-through

Commitment stats update in real-time as people subscribe/unsubscribe. Activity stats update daily at 3 AM UTC since they aggregate 7-day rolling averages.

## Where Statistics Appear

**Admin People Groups List** shows all four metrics for each people group: committed count, pledged duration, praying count, and daily prayer time. This lets you compare both commitment and engagement across people groups at a glance.

**Public People Group Page** shows commitment stats (people committed, pledged duration) and the "people praying" activity count. Daily prayer time is not currently shown publicly.

## When Statistics Update

**Commitment stats** (people committed, pledged duration) are calculated on-the-fly from the subscriptions table. They reflect changes immediately when someone subscribes or unsubscribes.

**Activity stats** (people praying, daily prayer time) are recalculated once daily at 3 AM UTC. They also update when the server restarts. This means there can be a delay between when someone prays and when the people group numbers reflect it.

## Design Decisions

**Commitment stats calculated on-the-fly** - Rather than storing commitment counts in columns, they're computed from the subscriptions table each time. This keeps stats always accurate without needing scheduled updates or risking data getting out of sync.

**7-day rolling window** - Activity statistics look at the past 7 days only. This shows recent engagement while smoothing out day-to-day variation. A people group that was very active last month but quiet this week will show low numbers.

**True daily average for time** - Daily prayer time divides by 7 regardless of how many days had activity. This prevents the number from looking artificially high when activity is sparse.

**Capture without requiring action** - Automatic saving ensures prayer time is recorded even when people don't click the button. Many people read the content, pray, and close the tab without thinking to click anything.

**Frequent auto-saves** - The system saves frequently (every minute after the first 30 seconds) so that prayer time is captured accurately even if the tab is closed mid-session. Automatic saving stops after 15 minutes—beyond that point, someone has likely left the page open rather than actively praying.

**Anonymous tracking via browser storage** - Anyone can access prayer content without coming through a tracked link. Their browser stores a unique ID so they're recognized when they return. This provides accurate counting without requiring accounts or logins.

## Current Limitations

- No way for individuals to see their own prayer history
- Statistics update daily rather than in real time
- No prayer streaks, badges, or other gamification
- Cannot distinguish between active prayer time and leaving the page open
- No breakdown of when during the day people pray
- Anonymous users on different browsers or devices are counted separately
- If someone clears their browser data, they'll be counted as a new person
