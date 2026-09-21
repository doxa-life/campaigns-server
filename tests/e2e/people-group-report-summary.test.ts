import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { v4 as uuidv4 } from 'uuid'
import { getTestDatabase, closeTestDatabase, cleanupTestData, createTestPeopleGroup } from '../helpers/db'
import { createAdminUser, type TestUser } from '../helpers/auth'

// Stub the outbound transport so the summary never makes a real SMTP call.
// vi.hoisted runs before the imports below, so the mock factory can reference the spy.
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn(async (_options: any) => true) }))
vi.mock('../../server/utils/email', () => ({ sendEmail: sendMock }))

import {
  getReportSummaryPeriod,
  collectReportMonthlySummary,
  runReportMonthlySummary,
  type ReportMonthlySummary
} from '../../server/utils/app/report-summary'
import { buildReportSummaryEmail } from '../../server/utils/app/report-emails'
import { peopleGroupReportService, type ReportSource, type ReportStatus } from '../../server/database/people-group-reports'

// A fixed clock keeps the summarized month far from any real data in the
// database, so the period-scoped count only ever sees this test's fixtures.
const NOW = new Date(Date.UTC(2020, 6, 15))
const IN_PERIOD = '2020-06-10T12:00:00.000Z'
const BEFORE_PERIOD = '2020-05-20T12:00:00.000Z'

describe('People group report monthly summary', async () => {
  const sql = getTestDatabase()

  let approver1: TestUser
  let approver2: TestUser
  let baseline: ReportMonthlySummary

  function awaitingFor(summary: ReportMonthlySummary, userId: string): number {
    return summary.approvers.find(a => a.id === userId)?.awaitingCount ?? 0
  }

  async function seedReport(opts: {
    peopleGroupId: number
    source: ReportSource
    status: ReportStatus
    createdAt: string
    approvedBy?: string[]
  }) {
    const report = await peopleGroupReportService.create({
      people_group_id: opts.peopleGroupId,
      type: 'update',
      source: opts.source,
      status: opts.status,
      reporter_name: 'Test Summary Reporter',
      reporter_email: `test-${uuidv4().slice(0, 8)}@example.com`,
      suggested_changes: { population: 1234 }
    })
    await sql`UPDATE people_group_reports SET created_at = ${opts.createdAt} WHERE id = ${report.id}`
    for (const userId of opts.approvedBy || []) {
      await peopleGroupReportService.addApproval(report.id, userId)
    }
    return report
  }

  beforeAll(async () => {
    await cleanupTestData(sql)

    approver1 = (await createAdminUser(sql, { display_name: 'Test Approver One' })).user
    approver2 = (await createAdminUser(sql, { display_name: 'Test Approver Two' })).user

    await sql`
      INSERT INTO app_config (key, value)
      VALUES ('people_group_report_approvers', ${JSON.stringify([approver1.id, approver2.id])})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `

    // Snapshot counts before seeding: the awaiting/approved figures are whole-queue
    // snapshots, so assertions compare deltas rather than absolute totals.
    baseline = await collectReportMonthlySummary(NOW)

    const group = await createTestPeopleGroup(sql, { title: 'Test Summary Group' })
    const peopleGroupId = group.id

    await seedReport({ peopleGroupId, source: 'public', status: 'pending', createdAt: IN_PERIOD })
    await seedReport({ peopleGroupId, source: 'public', status: 'pending', createdAt: IN_PERIOD, approvedBy: [approver1.id] })
    await seedReport({ peopleGroupId, source: 'public', status: 'pending', createdAt: IN_PERIOD, approvedBy: [approver1.id, approver2.id] })
    await seedReport({ peopleGroupId, source: 'public', status: 'pending', createdAt: BEFORE_PERIOD })
    await seedReport({ peopleGroupId, source: 'admin', status: 'pending', createdAt: IN_PERIOD })
    await seedReport({ peopleGroupId, source: 'public', status: 'awaiting_verification', createdAt: IN_PERIOD })
  })

  afterAll(async () => {
    await sql`DELETE FROM app_config WHERE key = 'people_group_report_approvers'`
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  beforeEach(() => {
    sendMock.mockClear()
  })

  describe('period', () => {
    it('summarizes the previous calendar month in UTC', () => {
      const period = getReportSummaryPeriod(NOW)
      expect(period.key).toBe('2020-06')
      expect(period.label).toBe('June 2020')
      expect(period.start.toISOString()).toBe('2020-06-01T00:00:00.000Z')
      expect(period.end.toISOString()).toBe('2020-07-01T00:00:00.000Z')
    })

    it('rolls back across the year boundary in January', () => {
      const period = getReportSummaryPeriod(new Date(Date.UTC(2026, 0, 1)))
      expect(period.key).toBe('2025-12')
      expect(period.label).toBe('December 2025')
    })
  })

  describe('counts', () => {
    it('counts public suggestions received, awaiting each approver, and approved by both', async () => {
      const { summary } = await runReportMonthlySummary(NOW)

      // Received in June 2020: the two pending public reports plus the approved
      // one. The admin report, the unverified one, and the May one are excluded.
      expect(summary.receivedCount - baseline.receivedCount).toBe(3)

      // Approved by both reviewers and waiting to be applied.
      expect(summary.approvedCount - baseline.approvedCount).toBe(1)

      // Approver one still owes the untouched report and the older one.
      expect(awaitingFor(summary, approver1.id) - awaitingFor(baseline, approver1.id)).toBe(2)
      // Approver two owes those plus the one only approver one signed.
      expect(awaitingFor(summary, approver2.id) - awaitingFor(baseline, approver2.id)).toBe(3)
    })
  })

  describe('email', () => {
    it('sends one summary to each designated approver with action links', async () => {
      const { summary, sentTo } = await runReportMonthlySummary(NOW)

      expect(sendMock).toHaveBeenCalledTimes(2)
      expect(sentTo.sort()).toEqual([approver1.email, approver2.email].sort())

      const recipients = sendMock.mock.calls.map(call => call[0].to).sort()
      expect(recipients).toEqual([approver1.email, approver2.email].sort())

      const { subject, html } = sendMock.mock.calls[0]![0]
      expect(subject).toContain('June 2020')
      expect(html).toContain('Test Approver One')
      expect(html).toContain('Test Approver Two')
      expect(html).toContain('/admin/people-groups/reports?status=awaiting_mine')
      expect(html).toContain('/admin/people-groups/reports?status=pending')
      // Something is approved by both, so the apply link is offered.
      expect(summary.approvedCount).toBeGreaterThan(0)
      expect(html).toContain('/admin/people-groups/reports?status=approved')
    })

    it('reports only the addresses the transport accepted', async () => {
      sendMock.mockResolvedValueOnce(false)

      const { sentTo } = await runReportMonthlySummary(NOW)

      expect(sendMock).toHaveBeenCalledTimes(2)
      expect(sentTo).toHaveLength(1)
    })

    it('states plainly when nothing came in and nothing is waiting', () => {
      const quiet: ReportMonthlySummary = {
        period: getReportSummaryPeriod(NOW),
        receivedCount: 0,
        approvedCount: 0,
        approvers: [
          { id: approver1.id, email: approver1.email, displayName: 'Test Approver One', awaitingCount: 0 },
          { id: approver2.id, email: approver2.email, displayName: 'Test Approver Two', awaitingCount: 0 }
        ]
      }

      const { subject, html } = buildReportSummaryEmail(quiet)

      expect(subject).toContain('June 2020')
      expect(html).toContain('No people group suggestions came in during June 2020')
      expect(html).not.toContain('?status=approved')
    })
  })
})
