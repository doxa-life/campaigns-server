import { submitPass, getLanguageEntries } from '#server/database/glossary'
import { requireReviewPass, limitReviewWrites } from '#server/utils/glossary-review'
import { notifyGlossaryReviewSubmitted } from '#server/utils/glossary-review-email'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * POST /api/glossary/review/:token/submit — mark the pass finished.
 *
 * Edits went in live, so this records completion and notifies the team. The
 * link keeps working: reviewers remember things a day later.
 */
export default defineEventHandler(async (event) => {
  try {
    const { pass, language } = await requireReviewPass(event)
    await limitReviewWrites(event, pass)

    const submitted = await submitPass(pass.id)
    if (!submitted) throw createError({ statusCode: 404, statusMessage: 'Review pass not found' })

    const entries = await getLanguageEntries(language.id)
    notifyGlossaryReviewSubmitted({ language, pass: submitted, entries }).catch(error => {
      console.error('[Glossary] review notification failed:', error)
    })

    return submitted
  } catch (error) {
    handleApiError(error, 'Failed to submit the review')
  }
})
