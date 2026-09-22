import { addAction } from '../utils/hooks'
import { peopleGroupReportService } from '../database/people-group-reports'
import { notifyReportApprovers } from '../utils/app/report-emails'
import { queueAddReportAutofill } from '../utils/app/add-report-autofill'
import type { ContactMethod } from '../database/contact-methods'

/**
 * When a reporter's email gets verified (via the /updates link or any other
 * verification flow), move their held-back suggestions into the review queue,
 * notify the designated approvers, and — for an "add" — queue the proposal of
 * the completion fields the reviewers need before they can approve.
 */
export default defineNitroPlugin(() => {
  addAction('contact.verified', async (contactMethod: ContactMethod) => {
    if (contactMethod.type !== 'email') return
    const promoted = await peopleGroupReportService.promoteAwaitingVerification(contactMethod.id)
    for (const report of promoted) {
      const withDetails = await peopleGroupReportService.getById(report.id)
      await queueAddReportAutofill(report)
      await notifyReportApprovers(withDetails || report)
    }
  })
})
