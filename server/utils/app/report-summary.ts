import { peopleGroupReportService } from '../../database/people-group-reports'
import { userService } from '../../database/users'
import { getReportApprovers } from './report-approvers'
import { sendReportSummaryEmail } from './report-emails'

export interface ReportSummaryPeriod {
  start: Date
  end: Date
  /** Lock/log key for the summarized month, e.g. '2026-08'. */
  key: string
  /** Human label for the summarized month, e.g. 'August 2026'. */
  label: string
}

export interface ReportSummaryApprover {
  id: string
  email: string
  displayName: string
  awaitingCount: number
}

export interface ReportMonthlySummary {
  period: ReportSummaryPeriod
  /** Public suggestions that entered review during the period. */
  receivedCount: number
  /** Current queue of suggestions both approvers signed off on, not yet applied. */
  approvedCount: number
  approvers: ReportSummaryApprover[]
}

export interface ReportMonthlySummaryResult {
  summary: ReportMonthlySummary
  /** Addresses the summary reached. */
  sentTo: string[]
}

/** The calendar month before `now`, in UTC. */
export function getReportSummaryPeriod(now: Date): ReportSummaryPeriod {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const key = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`
  const label = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(start)
  return { start, end, key, label }
}

/**
 * Counts for the month's approver summary. The received count is scoped to the
 * period; the awaiting and approved counts are snapshots of the current queue,
 * since older suggestions still need action.
 */
export async function collectReportMonthlySummary(now: Date): Promise<ReportMonthlySummary> {
  const period = getReportSummaryPeriod(now)

  const approverIds = await getReportApprovers()
  const approverUsers = await Promise.all(approverIds.map((id) => userService.getUserById(id)))

  const [receivedCount, approvedCount, approvers] = await Promise.all([
    peopleGroupReportService.countPublicReceived(period.start, period.end),
    peopleGroupReportService.count({ status: 'approved' }),
    Promise.all(
      approverUsers
        .filter((user): user is NonNullable<typeof user> => !!user?.email)
        .map(async (user) => ({
          id: user.id,
          email: user.email,
          displayName: user.display_name || user.email,
          awaitingCount: await peopleGroupReportService.countAwaitingApprovalBy(user.id)
        }))
    )
  ])

  return { period, receivedCount, approvedCount, approvers }
}

/** Collect the month's counts and email them to the designated approvers. */
export async function runReportMonthlySummary(now: Date): Promise<ReportMonthlySummaryResult> {
  const summary = await collectReportMonthlySummary(now)
  const sentTo = await sendReportSummaryEmail(summary)
  return { summary, sentTo }
}
