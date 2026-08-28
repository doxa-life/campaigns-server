import { useRuntimeConfig } from '#imports'
import { sendEmail } from '../email'
import { userService } from '../../database/users'
import { getReportApprovers } from './report-approvers'
import type { PeopleGroupReport } from '../../database/people-group-reports'

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

/**
 * Tell the reporter what happened to their suggestion. Outcome only — the
 * report's notes and the reviewers' comments are internal and never forwarded.
 */
export async function sendReportOutcomeEmail(
  report: PeopleGroupReport & { people_group_name?: string | null },
  outcome: 'applied' | 'denied'
): Promise<boolean> {
  if (!report.reporter_email) return false

  const applied = outcome === 'applied'
  const html = layout(
    applied ? 'Your suggestion was applied' : 'Your suggestion was not applied',
    `
      <p style="font-size: 16px;">Hello ${escapeHtml(report.reporter_name)},</p>
      <p style="font-size: 16px;">
        Your suggestion (<strong>${TYPE_LABELS[report.type] || report.type}</strong>: ${groupLabel(report)})
        was reviewed by the DOXA team and ${applied ? 'has been applied. Thank you for helping keep the list accurate!' : 'was not applied.'}
      </p>
      <p style="font-size: 15px;">Thank you for taking the time to contribute.</p>
    `
  )
  return sendEmail({
    to: report.reporter_email,
    subject: applied
      ? `Your people group suggestion was applied: ${groupLabel(report)}`
      : `Your people group suggestion: ${groupLabel(report)}`,
    html
  })
}
