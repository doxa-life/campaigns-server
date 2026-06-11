import { clearRecordedInboxEmails } from '../../utils/inbox-email'

/** VITEST-ONLY. Clear the recorded-inbox-emails buffer so a test can assert only on the
 *  sends that happen during its own queue drain. 404 in any non-test environment. */
export default defineEventHandler(() => {
  if (!process.env.VITEST) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  clearRecordedInboxEmails()
  return { ok: true }
})
