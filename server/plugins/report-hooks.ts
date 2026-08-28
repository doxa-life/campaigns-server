import { addAction } from '../utils/hooks'
import { peopleGroupReportService } from '../database/people-group-reports'
import { notifyReportApprovers } from '../utils/app/report-emails'
import type { ContactMethod } from '../database/contact-methods'

/**
 * When a reporter's email gets verified (via the /updates link or any other
 * verification flow), move their held-back suggestions into the review queue
 * and notify the designated approvers.
 */
export default defineNitroPlugin(() => {
  addAction('contact.verified', async (contactMethod: ContactMethod) => {
    if (contactMethod.type !== 'email') return
    const promoted = await peopleGroupReportService.promoteAwaitingVerification(contactMethod.id)
    for (const report of promoted) {
      const withDetails = await peopleGroupReportService.getById(report.id)
      await notifyReportApprovers(withDetails || report)
    }
  })
})
