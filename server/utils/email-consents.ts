import { contactMethodService } from '#server/database/contact-methods'
import { sendContactVerificationEmail } from './contact-verification-email'

/**
 * Apply news/marketing consents to a subscriber's email contact method and,
 * if the email isn't verified yet, send a verification (double opt-in) email.
 * The email contact method is expected to already exist (created during
 * subscriber resolution). Shared by anon-signup and news-signup.
 */
export async function applyEmailConsents(input: {
  email: string
  name: string
  language: string
  consentDoxaGeneral?: boolean
  consentPeopleGroupUpdates?: boolean
  peopleGroupId?: number | null
}): Promise<void> {
  const emailContact = await contactMethodService.getByValue('email', input.email)
  if (!emailContact) return

  if (input.consentDoxaGeneral) {
    await contactMethodService.updateDoxaConsent(emailContact.id, true)
  }

  if (input.consentPeopleGroupUpdates && input.peopleGroupId) {
    await contactMethodService.addPeopleGroupConsent(emailContact.id, input.peopleGroupId)
  }

  if (!emailContact.verified) {
    const token = await contactMethodService.generateVerificationToken(emailContact.id)
    sendContactVerificationEmail(input.email, token, input.name, input.language)
      .catch(err => console.error('Failed to send verification email:', err))
  }
}
