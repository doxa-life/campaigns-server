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

  // Only send the double-opt-in verification when at least one consent was
  // actually requested. Otherwise the user supplied their email purely for
  // dedup/identity and a "verify your email" message would be unsolicited.
  const consentRequested = input.consentDoxaGeneral || input.consentPeopleGroupUpdates
  if (!emailContact.verified && consentRequested) {
    // Reuse a still-valid link; only mail when it's the first one outstanding for
    // the address, so signing up across flows doesn't stack up verification emails.
    const { token, isNew } = await contactMethodService.generateVerificationToken(emailContact.id)
    if (isNew) {
      sendContactVerificationEmail(input.email, token, input.name, input.language)
        .catch(err => console.error('Failed to send verification email:', err))
    }
  }
}
