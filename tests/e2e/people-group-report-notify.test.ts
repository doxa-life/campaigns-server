import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { v4 as uuidv4 } from 'uuid'
import { getTestDatabase, closeTestDatabase, cleanupTestData } from '../helpers/db'

// Stub the outbound transport so no real email leaves the test run.
// vi.hoisted runs before the imports below, so the mock factory can reference the spy.
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn(async (_options: any) => true) }))
vi.mock('../../server/utils/email', () => ({ sendEmail: sendMock }))

import {
  notifyReportApplied,
  buildReportAppliedNotification,
  buildReportOutcomeEmail,
  sendReportOutcomeEmail
} from '../../server/utils/app/report-emails'
import { setReportNotifyEmails } from '../../server/utils/app/report-approvers'
import { peopleGroupReportService, type PeopleGroupReportWithDetails, type ReportType } from '../../server/database/people-group-reports'
import { peopleGroupService, type PeopleGroup } from '../../server/database/people-groups'

// Emails sent once a public suggestion is applied: the extra addresses
// configured beside the approver pair hear what changed on the list, and the
// reporter gets a short accepted-and-thank-you note.
describe('Applied suggestion emails', async () => {
  const sql = getTestDatabase()

  let addedGroup: PeopleGroup
  let addReport: PeopleGroupReportWithDetails
  let updateReport: PeopleGroupReportWithDetails
  let removeReport: PeopleGroupReportWithDetails

  async function seedReport(type: ReportType, peopleGroupId: number | null, changes: Record<string, any>) {
    const created = await peopleGroupReportService.create({
      people_group_id: peopleGroupId,
      people_group_name: peopleGroupId ? null : changes.name,
      type,
      source: 'public',
      status: 'accepted',
      reporter_name: 'Test Notify Reporter',
      reporter_org: 'Test Org',
      reporter_email: `test-${uuidv4().slice(0, 8)}@example.com`,
      suggested_changes: changes
    })
    return (await peopleGroupReportService.getById(created.id))!
  }

  beforeAll(async () => {
    await cleanupTestData(sql)

    addedGroup = await peopleGroupService.createPeopleGroup({
      name: 'Test Notify Added Group',
      slug: `test-notify-added-${uuidv4().slice(0, 8)}`,
      country_code: 'NPL',
      population: 4321,
      status: 'active',
      engagement_status: 'unengaged',
      primary_religion: 'HOF',
      primary_language: 'npi'
    })
    addReport = await seedReport('add', addedGroup.id, {
      name: 'Test Notify Added Group',
      country_code: 'NPL',
      population: 4321,
      primary_religion: 'HOF',
      primary_language: 'npi',
      imb_peid: 'TESTPEID123'
    })
    updateReport = await seedReport('update', addedGroup.id, { population: 5000, workers_long_term: 'true' })
    removeReport = await seedReport('remove', addedGroup.id, { reason_unlisted: 'is_diaspora' })
  })

  afterAll(async () => {
    await sql`DELETE FROM app_config WHERE key = 'people_group_report_notify_emails'`
    await cleanupTestData(sql)
    await closeTestDatabase()
  })

  beforeEach(() => {
    sendMock.mockClear()
  })

  describe('extra notification addresses', () => {
    it('sends nothing when no extra addresses are configured', async () => {
      await setReportNotifyEmails([])

      const sentTo = await notifyReportApplied(addReport, addedGroup)

      expect(sentTo).toEqual([])
      expect(sendMock).not.toHaveBeenCalled()
    })

    it('emails each configured address separately', async () => {
      await setReportNotifyEmails(['third@example.org', 'fourth@example.org'])

      const sentTo = await notifyReportApplied(addReport, addedGroup)

      expect(sentTo.sort()).toEqual(['fourth@example.org', 'third@example.org'])
      expect(sendMock).toHaveBeenCalledTimes(2)
      const recipients = sendMock.mock.calls.map(call => call[0].to).sort()
      expect(recipients).toEqual(['fourth@example.org', 'third@example.org'])
    })

    it('reports only the addresses the transport accepted', async () => {
      await setReportNotifyEmails(['third@example.org', 'fourth@example.org'])
      sendMock.mockResolvedValueOnce(false)

      const sentTo = await notifyReportApplied(addReport, addedGroup)

      expect(sendMock).toHaveBeenCalledTimes(2)
      expect(sentTo).toEqual(['fourth@example.org'])
    })

    it('announces a new group on the list with its labelled details', () => {
      const { subject, html } = buildReportAppliedNotification(addReport, addedGroup)

      expect(subject).toBe('New people group added to the DOXA list: Test Notify Added Group')
      expect(html).toContain('has been added to the DOXA list')
      expect(html).toContain('Suggested by Test Notify Reporter (Test Org)')
      expect(html).toContain('<strong>People Group Name:</strong> Test Notify Added Group')
      expect(html).toContain('<strong>Country:</strong> Nepal')
      expect(html).toContain('<strong>Population:</strong> 4,321')
      expect(html).toContain('<strong>Engagement Status:</strong> Unengaged')
      expect(html).toContain('<strong>Primary Religion:</strong> Hinduism - Folk')
      expect(html).toContain('<strong>Primary Language:</strong> Nepali')
      expect(html).toContain('<strong>IMB PEID:</strong> TESTPEID123')
      expect(html).toContain(`/${addedGroup.slug}`)
      // Recipients may lack admin access, so nothing links into the admin.
      expect(html).not.toContain('/admin/')
    })

    it('lists the changed fields for an update', () => {
      const { subject, html } = buildReportAppliedNotification(updateReport)

      expect(subject).toBe('People group updated on the DOXA list: Test Notify Added Group')
      expect(html).toContain('has been updated on the DOXA list')
      expect(html).toContain('<strong>Population:</strong> 5,000')
      expect(html).toContain('Yes')
      expect(html).toContain(`/${updateReport.people_group_slug}`)
    })

    it('gives the reason for a removal and drops the public link', () => {
      const { subject, html } = buildReportAppliedNotification(removeReport)

      expect(subject).toBe('People group removed from the DOXA list: Test Notify Added Group')
      expect(html).toContain('has been removed from the DOXA list')
      expect(html).toContain('<strong>Reason Unlisted:</strong> Is Diaspora')
      expect(html).not.toContain('View People Group')
      expect(html).not.toContain('/admin/')
    })

    it('escapes submitted values in the email body', () => {
      const { html } = buildReportAppliedNotification({
        ...updateReport,
        reporter_name: '<script>alert(1)</script>',
        suggested_changes: { imb_alternate_name: 'Tom & "Jerry"' }
      })
      expect(html).not.toContain('<script>')
      expect(html).toContain('&lt;script&gt;')
      expect(html).toContain('Tom &amp; &quot;Jerry&quot;')
    })
  })

  describe('reporter outcome email', () => {
    it('thanks the reporter for an accepted addition', async () => {
      const sent = await sendReportOutcomeEmail(addReport, 'applied')

      expect(sent).toBe(true)
      expect(sendMock).toHaveBeenCalledTimes(1)
      const { to, subject, html } = sendMock.mock.calls[0]![0]
      expect(to).toBe(addReport.reporter_email)
      expect(subject).toBe('Your people group suggestion was accepted: Test Notify Added Group')
      expect(html).toContain('Hello Test Notify Reporter')
      expect(html).toContain('has been accepted, and the group is now on the DOXA list')
      expect(html).toContain('Thank you for your contribution.')
      // Internal review material never reaches the reporter.
      expect(html).not.toContain('TESTPEID123')
    })

    it('words the accepted note per suggestion type', () => {
      expect(buildReportOutcomeEmail(updateReport, 'applied').html).toContain('has been accepted and applied to the DOXA list')
      expect(buildReportOutcomeEmail(removeReport, 'applied').html).toContain('is no longer on the DOXA list')
    })

    it('tells the reporter plainly when a suggestion was not applied', () => {
      const { subject, html } = buildReportOutcomeEmail(updateReport, 'denied')
      expect(subject).toBe('Your people group suggestion: Test Notify Added Group')
      expect(html).toContain('was not applied')
    })
  })
})
