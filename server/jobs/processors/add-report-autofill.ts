import type { Job, AddReportAutofillPayload } from '../../database/job-queue'
import type { ProcessorResult } from './index'
import { peopleGroupReportService } from '../../database/people-group-reports'
import { autoPopulateAddReport } from '../../utils/app/add-report-autofill'
import { readAddFields } from '../../utils/app/add-report-fields'

/**
 * Propose the fields an "add" report needs to create its people group, as soon
 * as the report becomes reviewable. Running here rather than at apply time
 * means the reviewers see the proposal — and what it could not determine —
 * before they approve, and the reporter's verification link is not held open
 * for the AI call.
 */
export async function processAddReportAutofill(job: Job): Promise<ProcessorResult> {
  const payload = job.payload as AddReportAutofillPayload

  const report = await peopleGroupReportService.getById(payload.report_id)
  if (!report) {
    return { success: false, retryable: false, data: { error: 'Report not found' } }
  }
  if (report.type !== 'add') {
    return { success: true, data: { skipped: true, reason: 'Not an add report' } }
  }
  if (report.status === 'accepted' || report.status === 'denied') {
    return { success: true, data: { skipped: true, reason: `Report already ${report.status}` } }
  }
  // A second verification, or a requeue after the fields were already
  // proposed, must not spend another AI call.
  if (readAddFields(report.add_fields).generated_at) {
    return { success: true, data: { skipped: true, reason: 'Fields already proposed' } }
  }

  try {
    const result = await autoPopulateAddReport(report)
    await peopleGroupReportService.saveAddFieldsProposal(payload.report_id, result)
    return { success: true, data: { source: result.source, filled: Object.keys(result.fields).length } }
  } catch (error: any) {
    const message = error?.statusMessage || error?.message || 'Auto-populate failed'
    // The reviewers still need to know why the section is empty, whether or
    // not a retry is coming.
    await peopleGroupReportService.recordAddFieldsWarning(payload.report_id, message)
    return { success: false, retryable: true, data: { error: message } }
  }
}
