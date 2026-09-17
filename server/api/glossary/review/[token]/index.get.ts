import { getLanguageEntries, touchPass } from '#server/database/glossary'
import { requireReviewPass } from '#server/utils/glossary-review'
import { getBollsTranslations } from '#server/utils/bolls-languages'
import { GLOSSARY_CHROME_EN, fillChrome } from '../../../../../config/glossary-chrome'
import { handleApiError } from '#server/utils/api-helpers'

/**
 * GET /api/glossary/review/:token — everything the review page shows.
 *
 * The reviewer sees each label in English and in their own language, so the
 * response carries both halves of the page wording alongside the terms.
 */
export default defineEventHandler(async (event) => {
  try {
    const { pass, language } = await requireReviewPass(event)
    const [entries, bibleTranslations] = await Promise.all([
      getLanguageEntries(language.id),
      getBollsTranslations(language.name_en)
    ])
    await touchPass(pass.id)

    return {
      pass: {
        id: pass.id,
        label: pass.label,
        reviewer_name: pass.reviewer_name,
        reviewer_email: pass.reviewer_email,
        status: pass.status,
        submitted_at: pass.submitted_at
      },
      language: {
        code: language.code,
        name_en: language.name_en,
        name_local: language.name_local,
        text_direction: language.text_direction,
        bible_id: language.bible_id,
        bible_translation: language.bible_translation,
        bible_translation_note: language.bible_translation_note
      },
      chrome_en: fillChrome(GLOSSARY_CHROME_EN, language.name_en),
      chrome_local: language.chrome,
      bible_translations: bibleTranslations,
      entries
    }
  } catch (error) {
    handleApiError(error, 'Failed to open the review')
  }
})
