import { useRuntimeConfig } from '#imports'
import { sendEmail } from '../email'
import { userService } from '../../database/users'
import { getReportApprovers, getReportNotifyEmails } from './report-approvers'
import type { PeopleGroupReport } from '../../database/people-group-reports'
import type { PeopleGroup } from '../../database/people-groups'
import { peopleGroupFieldLabel, peopleGroupFieldDisplay } from './people-group-field-labels'
import type { ReportMonthlySummary } from './report-summary'

const TYPE_LABELS: Record<string, string> = {
  add: 'Add a people group',
  update: 'Update a people group',
  remove: 'Remove a people group'
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function layout(title: string, bodyHtml: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #3B463D; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #3B463D; color: #ffffff; padding: 24px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="margin: 0; font-size: 24px; font-weight: 500;">${title}</h1>
      </div>
      <div style="border: 2px solid #3B463D; border-top: none; padding: 30px; border-radius: 0 0 10px 10px;">
        ${bodyHtml}
      </div>
    </div>
  `
}

function button(url: string, label: string): string {
  return `
    <div style="text-align: center; margin: 24px 0;">
      <a href="${url}" style="background: #3B463D; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 5px; font-size: 16px; display: inline-block;">${label}</a>
    </div>
  `
}

function groupLabel(report: PeopleGroupReport & { people_group_name?: string | null }): string {
  return escapeHtml(report.people_group_name || (report.suggested_changes?.name as string) || `Report #${report.id}`)
}

/** Ask the reporter to verify their email so the suggestion enters review. */
export async function sendReportVerificationEmail(to: string, token: string): Promise<boolean> {
  const baseUrl = useRuntimeConfig().public.siteUrl || 'http://localhost:3000'
  const verifyUrl = `${baseUrl}/api/updates/verify?token=${token}`
  const html = layout(
    'Verify your email',
    `
      <p style="font-size: 16px;">Thank you for submitting a people group suggestion to DOXA.</p>
      <p style="font-size: 16px;">Please verify your email address so your suggestion can be reviewed:</p>
      ${button(verifyUrl, 'Verify Email')}
      <p style="color: #666666; font-size: 14px;">If the button doesn't work, copy this link into your browser:</p>
      <p style="background: #f5f5f5; border: 1px solid #cccccc; padding: 10px; border-radius: 4px; word-break: break-all; font-size: 13px;">${verifyUrl}</p>
      <p style="color: #666666; font-size: 14px;">If you didn't submit anything, you can ignore this email.</p>
    `
  )
  return sendEmail({ to, subject: 'Verify your email — DOXA people group suggestion', html })
}

/** Notify both designated approvers that a suggestion entered the queue. */
export async function notifyReportApprovers(report: PeopleGroupReport & { people_group_name?: string | null }): Promise<void> {
  const baseUrl = useRuntimeConfig().public.siteUrl || 'http://localhost:3000'
  const reviewUrl = `${baseUrl}/admin/people-groups/reports?id=${report.id}`
  const typeLabel = TYPE_LABELS[report.type] || report.type
  const reporter = escapeHtml(
    report.reporter_org ? `${report.reporter_name} (${report.reporter_org})` : report.reporter_name
  )

  const html = layout(
    'New people group suggestion',
    `
      <p style="font-size: 16px;"><strong>${typeLabel}</strong>: ${groupLabel(report)}</p>
      <p style="font-size: 16px;">Submitted by ${reporter}${report.reporter_email ? ` &lt;${escapeHtml(report.reporter_email)}&gt;` : ''}.</p>
      ${report.notes ? `<p style="font-size: 15px; background: #f5f5f5; padding: 12px; border-radius: 4px;">${escapeHtml(report.notes)}</p>` : ''}
      ${button(reviewUrl, 'Review Suggestion')}
    `
  )

  const approverIds = await getReportApprovers()
  for (const userId of approverIds) {
    const user = await userService.getUserById(userId)
    if (user?.email) {
      await sendEmail({ to: user.email, subject: `New people group suggestion: ${groupLabel(report)}`, html })
    }
  }
}

type AppliedReport = PeopleGroupReport & { people_group_name?: string | null; people_group_slug?: string | null }

// Columns shown first in an applied-suggestion email, in this order; any other
// submitted field follows.
const HEADLINE_FIELDS = ['name', 'country_code', 'population', 'engagement_status', 'primary_religion', 'primary_language']

function detailRows(rows: [string, unknown][]): string {
  const items = rows
    .map(([key, value]) => [peopleGroupFieldLabel(key), peopleGroupFieldDisplay(key, value)] as const)
    .filter(([, display]) => display !== '')
    .map(([label, display]) => `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(display)}</li>`)
    .join('')
  return items ? `<ul style="font-size: 15px; padding-left: 20px;">${items}</ul>` : ''
}

/** Headline columns from the applied group, then every other submitted field. */
function appliedDetails(report: AppliedReport, peopleGroup?: PeopleGroup | null): [string, unknown][] {
  const rows: [string, unknown][] = []
  const seen = new Set<string>()
  for (const key of HEADLINE_FIELDS) {
    const value = peopleGroup ? (peopleGroup as any)[key] : report.suggested_changes?.[key]
    if (value === null || value === undefined || value === '') continue
    rows.push([key, value])
    seen.add(key)
  }
  for (const [key, value] of Object.entries(report.suggested_changes || {})) {
    if (seen.has(key) || key === 'image_url') continue
    rows.push([key, value])
  }
  return rows
}

/**
 * Tell the extra notification addresses that a public suggestion has been
 * applied: a new group on the list with its details, a group's changed fields,
 * or a removal with its reason. Recipients need not have admin access, so the
 * only link is the public people group page. Sent alongside the reporter's
 * outcome email; each address gets its own copy so recipients never see one
 * another.
 */
export function buildReportAppliedNotification(
  report: AppliedReport,
  peopleGroup?: PeopleGroup | null
): { subject: string; html: string } {
  const baseUrl = useRuntimeConfig().public.siteUrl || 'http://localhost:3000'
  const slug = peopleGroup?.slug || report.people_group_slug
  const group = groupLabel(report)
  const reporter = escapeHtml(
    report.reporter_org ? `${report.reporter_name} (${report.reporter_org})` : report.reporter_name
  )

  let title: string
  let subject: string
  let lead: string
  if (report.type === 'add') {
    title = 'New people group added'
    subject = `New people group added to the DOXA list: ${group}`
    lead = `<strong>${group}</strong> has been added to the DOXA list.`
  } else if (report.type === 'remove') {
    title = 'People group removed'
    subject = `People group removed from the DOXA list: ${group}`
    lead = `<strong>${group}</strong> has been removed from the DOXA list.`
  } else {
    title = 'People group updated'
    subject = `People group updated on the DOXA list: ${group}`
    lead = `<strong>${group}</strong> has been updated on the DOXA list.`
  }

  const html = layout(
    title,
    `
      <p style="font-size: 16px;">${lead}</p>
      <p style="font-size: 15px; color: #666666;">Suggested by ${reporter} and approved by both reviewers.</p>
      ${detailRows(appliedDetails(report, report.type === 'add' ? peopleGroup : null))}
      ${slug && report.type !== 'remove' ? button(`${baseUrl}/${slug}`, 'View People Group') : ''}
    `
  )
  return { subject, html }
}

/** Email each configured extra address about an applied suggestion; returns the addresses reached. */
export async function notifyReportApplied(report: AppliedReport, peopleGroup?: PeopleGroup | null): Promise<string[]> {
  const emails = await getReportNotifyEmails()
  if (emails.length === 0) return []

  const { subject, html } = buildReportAppliedNotification(report, peopleGroup)
  const sentTo: string[] = []
  for (const to of emails) {
    if (await sendEmail({ to, subject, html })) {
      sentTo.push(to)
    }
  }
  return sentTo
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `<strong>${count}</strong> ${count === 1 ? singular : pluralForm}`
}

/**
 * The month's suggestion summary for the designated approvers. Both approvers
 * receive identical HTML; the "awaiting my approval" link resolves per viewer
 * from their own session in the admin UI.
 */
export function buildReportSummaryEmail(summary: ReportMonthlySummary): { subject: string; html: string } {
  const baseUrl = useRuntimeConfig().public.siteUrl || 'http://localhost:3000'
  const reportsUrl = `${baseUrl}/admin/people-groups/reports`
  const { label } = summary.period

  const quiet = summary.receivedCount === 0 &&
    summary.approvedCount === 0 &&
    summary.approvers.every((a) => a.awaitingCount === 0)

  const body = quiet
    ? `
      <p style="font-size: 16px;">No people group suggestions came in during ${label}, and nothing is waiting for approval.</p>
      ${button(reportsUrl, 'Open Suggestions')}
    `
    : `
      <p style="font-size: 16px;">Here is the summary of public people group suggestions for <strong>${label}</strong>.</p>
      <ul style="font-size: 16px; padding-left: 20px;">
        <li>${plural(summary.receivedCount, 'new suggestion', 'new suggestions')} came in during ${label}.</li>
        <li>${plural(summary.approvedCount, 'suggestion is', 'suggestions are')} approved by both reviewers and ready to apply.</li>
      </ul>
      <p style="font-size: 16px; margin-bottom: 4px;">Awaiting approval:</p>
      <ul style="font-size: 16px; padding-left: 20px;">
        ${summary.approvers
          .map((a) => `<li>${escapeHtml(a.displayName)}: ${plural(a.awaitingCount, 'suggestion', 'suggestions')}</li>`)
          .join('')}
      </ul>
      ${button(`${reportsUrl}?status=awaiting_mine`, 'Suggestions Awaiting My Approval')}
      ${button(`${reportsUrl}?status=pending`, 'Review Pending Suggestions')}
      ${summary.approvedCount > 0 ? button(`${reportsUrl}?status=approved`, 'Apply Approved Suggestions') : ''}
    `

  return {
    subject: `People group suggestions: ${label} summary`,
    html: layout(`Suggestions summary: ${label}`, body)
  }
}

/** Email the month's summary to each designated approver; returns the addresses reached. */
export async function sendReportSummaryEmail(summary: ReportMonthlySummary): Promise<string[]> {
  const { subject, html } = buildReportSummaryEmail(summary)

  const sentTo: string[] = []
  for (const approver of summary.approvers) {
    if (await sendEmail({ to: approver.email, subject, html })) {
      sentTo.push(approver.email)
    }
  }
  return sentTo
}

/**
 * Tell the reporter what happened to their suggestion. Outcome only — the
 * report's notes and the reviewers' comments are internal and never forwarded.
 */
export function buildReportOutcomeEmail(
  report: AppliedReport,
  outcome: 'applied' | 'denied'
): { subject: string; html: string } {
  const group = groupLabel(report)
  const accepted = outcome === 'applied'

  let summary: string
  if (!accepted) {
    summary = `Your suggestion (<strong>${TYPE_LABELS[report.type] || report.type}</strong>: ${group}) was reviewed by the DOXA team and was not applied.`
  } else if (report.type === 'add') {
    summary = `Your suggestion to add <strong>${group}</strong> has been accepted, and the group is now on the DOXA list.`
  } else if (report.type === 'remove') {
    summary = `Your suggestion to remove <strong>${group}</strong> has been accepted, and the group is no longer on the DOXA list.`
  } else {
    summary = `Your suggested update to <strong>${group}</strong> has been accepted and applied to the DOXA list.`
  }

  const html = layout(
    accepted ? 'Your suggestion was accepted' : 'Your suggestion was not applied',
    `
      <p style="font-size: 16px;">Hello ${escapeHtml(report.reporter_name)},</p>
      <p style="font-size: 16px;">${summary}</p>
      <p style="font-size: 16px;">Thank you for your contribution.</p>
    `
  )
  return {
    subject: accepted
      ? `Your people group suggestion was accepted: ${group}`
      : `Your people group suggestion: ${group}`,
    html
  }
}

export async function sendReportOutcomeEmail(report: AppliedReport, outcome: 'applied' | 'denied'): Promise<boolean> {
  if (!report.reporter_email) return false
  const { subject, html } = buildReportOutcomeEmail(report, outcome)
  return sendEmail({ to: report.reporter_email, subject, html })
}
