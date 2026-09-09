# Surveys

## Overview

Surveys let us ask the people who receive daily prayer content how it is working for them. Responses feed the team's planning for future content. A survey is sent as a marketing email, answered on a public page without logging in, and reviewed under **Marketing → Surveys** in the admin area.

There is currently one survey: the **May 2026 Intercessor Survey**, titled "Your prayer experience" on the public page. It asks nine questions about how often people use the content, whether the prompts help them focus, the balance of scripture and prayer points, their preference for scripted versus strategic prayers, whether they like the rotating daily people group and the background information, and two open questions about what has been most helpful and what they would change.

## How a Survey Is Defined

Survey questions are defined in code, together with their translations in all eleven site languages. The system stores only the survey's name, whether it is open or closed, and the responses. Three question styles are available:

- **Scale** — a numbered row (for example 1 to 5) with worded anchors such as "Not at all", "Somewhat", and "Very much"
- **Choice** — a list of worded options, one of which is picked
- **Text** — a free-text box

Adding a new survey or changing questions is a development task, not something done in the admin area. A fully admin-editable survey builder was prototyped on a separate branch but has not been released.

## Sending a Survey

Surveys go out through the regular marketing email tool. When composing a marketing email, choose the survey from the **Template** dropdown instead of writing your own content. The subject and body are then fixed, and the email is rendered in each recipient's preferred language with a personal link to the survey page. Use **Preview** to see it (the preview is always in English).

The May 2026 survey email is titled "Would you share how prayer has been going?" and carries a **Take the survey** button. It is intended for the **All Active Subscribers** audience, which includes everyone with an active people group subscription regardless of marketing consent. Because this is a product feedback message rather than promotion, its unsubscribe link only turns off "Product emails" for that person; their prayer reminders and other marketing preferences are unaffected.

## The Respondent Experience

The link in the email identifies the subscriber, so no login is needed and every response is tied to a known contact. Opening the page shows the survey title, a short intro, and the numbered questions, ending with a **Send my responses** button. The page appears in the language of the link the subscriber received.

- **No question is required.** People can skip any question and still submit.
- **Answers can be revised.** Returning to the same link later shows the previous answers with a note that they can be updated and resaved. There is one response per person per survey; resubmitting replaces the earlier one.
- After submitting, a thank-you message appears.
- If the link is not valid, the page explains that the link from the email should be used. If the survey has been closed, it says it is no longer accepting responses.

## The Admin View

**Marketing → Surveys** lists every survey with its response count. Selecting one shows a header with three views:

**Summary** shows each question in survey order. Scale and choice questions show the average (for scales), the number of answers, and a horizontal bar for each option. Text questions list every answer verbatim, newest first, without names attached.

**Responses** shows one card per person, newest first, with their name, when they submitted, their preferred language, and the people groups they are subscribed to, followed by all their answers. A trash icon deletes a response after confirmation; this permanently removes it and its answers.

**Export CSV** downloads every response with the subscriber's profile ID, submission and update times, language, people groups, and one column per question. Scale and choice answers are exported as numbers rather than labels. Free-text values are protected against spreadsheet formula injection.

Each submission is also recorded on the subscriber's activity timeline in **Contacts** as a "Survey Response" entry with all their answers, so staff see feedback in context when looking at a person's record.

The total number of survey responses appears as "Total surveys filled out" in the activity summary emails.

## Who Can Do What

Viewing surveys, results, responses, and exports requires the marketing view permission. Deleting a response requires the marketing send permission. Today both are held by Admins and Progress Admins.

## Design Decisions

**Questions live in code.** This keeps the wording, translations, and analysis consistent, and means a change to a question is a reviewed code change rather than an edit that could silently break past results.

**One response per person, editable.** People can change their mind without creating duplicates, and the response count always equals the number of unique respondents.

**Context is captured at submission time.** Each response records the subscriber's language and people groups as they were when they answered, so later changes to their subscriptions do not alter the analysis.

**Responses are not anonymous.** Tying each response to a subscriber lets staff see it on the contact's timeline and follow up if needed. Free-text answers are shown unattributed in the Summary view to make reading them as a whole easier.

**Product emails are a separate consent.** Feedback requests are about the tools a person already uses, so they go to all active subscribers. Opting out of them does not stop prayer reminders or general DOXA updates.

## Current Limitations

- Only one survey exists, and the public page, results, and export are built around it. A second survey would require development work
- No admin tool to create or edit surveys, or to open and close one
- Nothing tracks who was invited, so there is no response rate, no reminder to non-responders, and no link from a response back to the email that prompted it
- An entirely empty submission is accepted and counted as a response
- Clearing a previously given answer and resaving does not remove the stored answer
- The survey link is the subscriber's profile link, so anyone holding it could submit on that person's behalf
- Analysis is limited to averages and counts; there is no filtering by language, people group, or date, and no charts
- The Responses view shows names but does not link to the contact's record
- Free-text answers longer than 5,000 characters are cut off without warning
