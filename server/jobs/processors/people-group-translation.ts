import type { Job, PeopleGroupTranslationPayload } from '../../database/job-queue'
import type { ProcessorResult } from './index'
import { peopleGroupService } from '../../database/people-groups'
import { isTranslationConfigured, translateTexts } from '../../utils/translate'
import { getField } from '~/utils/people-group-fields'
import { ENABLED_LANGUAGE_CODES } from '../../../config/languages'

/**
 * Fill the missing languages of one translatable people-group field from its
 * source-language text. Each language is saved as soon as it is translated,
 * so a retry after a failure only redoes what is still missing.
 */
export async function processPeopleGroupTranslation(job: Job): Promise<ProcessorResult> {
  const payload = job.payload as PeopleGroupTranslationPayload

  if (!isTranslationConfigured()) {
    return { success: false, retryable: false, data: { error: 'Translation service not configured' } }
  }

  const field = getField(payload.field_key)
  if (!field || field.type !== 'translatable') {
    return { success: false, retryable: false, data: { error: `${payload.field_key} is not a translatable field` } }
  }

  const peopleGroup = await peopleGroupService.getPeopleGroupById(payload.people_group_id)
  if (!peopleGroup) {
    return { success: false, retryable: false, data: { error: 'People group not found' } }
  }

  const stored = field.tableColumn ? (peopleGroup as any)[field.key] : peopleGroup.metadata?.[field.key]
  const translations: Record<string, string> = { ...((stored as Record<string, string> | null) || {}) }
  const source = translations[payload.source_language]?.trim()
  if (!source) {
    return { success: true, data: { skipped: true, reason: 'No source text' } }
  }

  const targets = ENABLED_LANGUAGE_CODES.filter(
    (code) => code !== payload.source_language && !translations[code]?.trim()
  )
  for (const code of targets) {
    const [translated] = await translateTexts([source], code, payload.source_language)
    if (!translated?.trim()) continue
    translations[code] = translated.trim()
    if (field.tableColumn) {
      await peopleGroupService.updatePeopleGroup(peopleGroup.id, { [field.key]: translations } as any)
    } else {
      await peopleGroupService.updatePeopleGroup(peopleGroup.id, {
        metadata: { [field.key]: translations },
        mergeMetadata: true
      })
    }
  }

  return { success: true, data: { translated: targets } }
}
