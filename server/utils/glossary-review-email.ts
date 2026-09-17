/**
 * Notification sent when a reviewer finishes a glossary pass.
 *
 * Their edits are already live, so this is not an approval request — it tells
 * the team the round is done and what it produced, so someone can look at the
 * flagged terms and the notes.
 */

import { userService } from '../database/users'
import type { GlossaryEntry, GlossaryLanguage, GlossaryReviewPass } from '../database/glossary'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface GlossaryReviewSummary {
  language: GlossaryLanguage
  pass: GlossaryReviewPass
  entries: GlossaryEntry[]
}

function buildSummary({ language, pass, entries }: GlossaryReviewSummary) {
  const confirmed = entries.filter(entry => entry.status === 'confirmed')
  const flagged = entries.filter(entry => entry.status === 'flagged')
  const withNotes = entries.filter(entry => entry.note?.trim())
  const reviewer = pass.reviewer_name || 'an unnamed reviewer'

  return { confirmed, flagged, withNotes, reviewer }
}

function sendReviewSubmittedEmail(to: string, data: GlossaryReviewSummary): Promise<boolean> {
  const config = useRuntimeConfig()
  const siteUrl = config.public.siteUrl || 'http://localhost:3000'
  const appName = config.appName || 'DOXA Prayer'
  const { confirmed, flagged, withNotes, reviewer } = buildSummary(data)

  const languageUrl = `${siteUrl}/admin/glossary/${data.language.code}`
  const subject = `${data.language.name_en} glossary review finished — ${data.pass.label}`

  const flaggedList = flagged.length
    ? `<h3 style="color: #3B463D;">Flagged for discussion</h3><ul>${flagged
        .map(entry => `<li><strong>${escapeHtml(entry.term)}</strong> → ${escapeHtml(entry.value)}${entry.note ? ` — ${escapeHtml(entry.note)}` : ''}</li>`)
        .join('')}</ul>`
    : ''

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><title>${escapeHtml(subject)}</title></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #3B463D;">${escapeHtml(data.language.name_en)} glossary review finished</h2>
      <p>
        ${escapeHtml(reviewer)} finished <strong>${escapeHtml(data.pass.label)}</strong>.
        ${data.pass.reviewer_email
          ? `<br><a href="mailto:${escapeHtml(data.pass.reviewer_email)}" style="color: #3B463D;">${escapeHtml(data.pass.reviewer_email)}</a>`
          : ''}
      </p>
      <ul>
        <li>${confirmed.length} of ${data.entries.length} terms confirmed</li>
        <li>${flagged.length} flagged for discussion</li>
        <li>${withNotes.length} carrying a reviewer note</li>
        ${data.language.bible_translation ? `<li>Bible translation reported: ${escapeHtml(data.language.bible_translation)}</li>` : ''}
      </ul>
      ${flaggedList}
      <p><a href="${languageUrl}" style="color: #3B463D;">Open the ${escapeHtml(data.language.name_en)} glossary</a></p>
      <div style="margin-top: 20px; padding: 15px; color: #999; font-size: 12px;">
        This is an automated notification from ${escapeHtml(appName)}.
      </div>
    </body>
    </html>
  `

  const text = [
    `${data.language.name_en} glossary review finished`,
    '',
    `${reviewer} finished ${data.pass.label}.`,
    data.pass.reviewer_email || '',
    `${confirmed.length} of ${data.entries.length} terms confirmed`,
    `${flagged.length} flagged for discussion`,
    `${withNotes.length} carrying a reviewer note`,
    data.language.bible_translation ? `Bible translation reported: ${data.language.bible_translation}` : '',
    '',
    languageUrl
  ].filter(Boolean).join('\n')

  return sendEmail({ to, subject, html, text })
}

export async function notifyGlossaryReviewSubmitted(data: GlossaryReviewSummary): Promise<void> {
  const users = await userService.getUsersOptedIntoGlossaryReview()
  if (users.length === 0) return

  const results = await Promise.allSettled(users.map(user => sendReviewSubmittedEmail(user.email, data)))
  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('Failed to send glossary review notification:', result.reason)
    }
  }
}
