import { peopleGroupService, type PeopleGroup } from '#server/database/people-groups'
import { translateTexts, isTranslationConfigured } from '#server/utils/translate'
import { LANGUAGES } from '~/utils/languages'
import { allFields, type FieldDefinition } from '~/utils/people-group-fields'
import { getErrorMessage } from '#server/utils/api-helpers'

interface PeopleGroupWithEnglish {
  pg: PeopleGroup
  englishText: string
  fieldValue: Record<string, string>
  changed: boolean
}

function isPlainObject(value: unknown): value is Record<string, string> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * A translations map out of whatever the column holds.
 *
 * A jsonb `||` merge against a JSON string instead of an object concatenates
 * rather than merging, so a row can hold `["{}", { en: "..." }]`. Reading `.en`
 * off that is undefined, which would drop the group from the run unnoticed.
 */
function normalizeTranslations(value: unknown): Record<string, string> | null {
  if (isPlainObject(value)) return value

  if (Array.isArray(value)) {
    const merged: Record<string, string> = {}
    for (const entry of value) {
      const normalized = normalizeTranslations(entry)
      if (normalized) Object.assign(merged, normalized)
    }
    return Object.keys(merged).length > 0 ? merged : null
  }

  if (typeof value === 'string') {
    try {
      return normalizeTranslations(JSON.parse(value))
    } catch {
      return null
    }
  }

  return null
}

/**
 * Batch translate a translatable field for all people groups
 * Uses Server-Sent Events (SSE) to stream progress updates
 *
 * POST /api/admin/people-groups/translate-field
 *
 * Body:
 * - fieldKey: string - The field key to translate (must be type: 'translatable')
 * - overwrite?: boolean - Whether to overwrite existing translations (default: false)
 *
 * Returns SSE stream with progress events and final stats
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'people_groups.edit')

  if (!isTranslationConfigured()) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Translation service not configured. Please add OPENROUTER_API_KEY to environment.'
    })
  }

  const body = await readBody(event)

  if (!body.field_key || typeof body.field_key !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Field key is required'
    })
  }

  const { field_key: fieldKey, overwrite = false } = body

  // Validate field exists and is translatable
  const field = allFields.find((f: FieldDefinition) => f.key === fieldKey)
  if (!field) {
    throw createError({
      statusCode: 400,
      statusMessage: `Unknown field: ${fieldKey}`
    })
  }

  if (field.type !== 'translatable') {
    throw createError({
      statusCode: 400,
      statusMessage: `Field ${fieldKey} is not a translatable field`
    })
  }

  // Set up SSE response
  setResponseHeader(event, 'Content-Type', 'text/event-stream')
  setResponseHeader(event, 'Cache-Control', 'no-cache')
  setResponseHeader(event, 'Connection', 'keep-alive')

  const sendEvent = (eventType: string, data: any) => {
    event.node.res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  try {
    const allPeopleGroups = await peopleGroupService.getAllPeopleGroups()

    sendEvent('progress', { phase: 'loading', message: `Loaded ${allPeopleGroups.length} people groups` })

    // Collect people groups with English content
    const peopleGroupsWithEnglish: PeopleGroupWithEnglish[] = []

    for (const pg of allPeopleGroups) {
      const rawValue = field.tableColumn
        ? (pg as any)[fieldKey]
        : pg.metadata?.[fieldKey]

      const fieldValue = normalizeTranslations(rawValue)

      const englishText = fieldValue?.en
      if (englishText && englishText.trim() !== '') {
        peopleGroupsWithEnglish.push({
          pg,
          englishText: englishText.trim(),
          fieldValue: fieldValue || {},
          // A value that was not already a plain object is rewritten in the
          // normalized shape even when no new translation is added.
          changed: !isPlainObject(rawValue)
        })
      }
    }

    const targetLanguages = LANGUAGES.filter(l => l.code !== 'en').map(l => l.code)
    const totalPeopleGroups = peopleGroupsWithEnglish.length
    const totalLanguages = targetLanguages.length

    sendEvent('progress', {
      phase: 'starting',
      message: `Found ${totalPeopleGroups} people groups with English content`,
      totalPeopleGroups,
      totalLanguages
    })

    const stats = {
      total: totalPeopleGroups,
      translated: 0,
      skipped: 0,
      errors: 0
    }

    const errorDetails: Array<{ peopleGroup: string; error: string }> = []

    // Process each target language with batch translation
    for (let langIndex = 0; langIndex < targetLanguages.length; langIndex++) {
      const targetLang = targetLanguages[langIndex]!
      const langName = LANGUAGES.find(l => l.code === targetLang)?.name || targetLang

      sendEvent('progress', {
        phase: 'translating',
        message: `Translating to ${langName}...`,
        currentLanguage: targetLang,
        languageIndex: langIndex + 1,
        totalLanguages
      })

      // Filter people groups that need translation for this language
      const needsTranslation = peopleGroupsWithEnglish.filter(item => {
        if (overwrite) return true
        return !item.fieldValue[targetLang]
      })

      if (needsTranslation.length === 0) {
        sendEvent('progress', {
          phase: 'skipped',
          message: `Skipped ${langName} - all translations exist`,
          currentLanguage: targetLang
        })
        continue
      }

      try {
        // Batch translate all texts for this language
        const textsToTranslate = needsTranslation.map(item => item.englishText)
        const translatedTexts = await translateTexts(textsToTranslate, targetLang, 'en')

        // Update each people group with its translation
        for (let i = 0; i < needsTranslation.length; i++) {
          const item = needsTranslation[i]!
          const translatedText = translatedTexts[i]!

          item.fieldValue[targetLang] = translatedText
          item.changed = true

          // Send progress every 10 items
          if (i % 10 === 0 || i === needsTranslation.length - 1) {
            sendEvent('progress', {
              phase: 'saving',
              message: `Saving ${langName} translations...`,
              currentLanguage: targetLang,
              saved: i + 1,
              totalForLanguage: needsTranslation.length
            })
          }
        }
      } catch (error) {
        errorDetails.push({
          peopleGroup: `Batch ${targetLang}`,
          error: getErrorMessage(error)
        })
        sendEvent('progress', {
          phase: 'error',
          message: `Error translating to ${langName}: ${getErrorMessage(error)}`,
          currentLanguage: targetLang
        })
      }
    }

    // Save all updates to database
    const toSave = peopleGroupsWithEnglish.filter(item => item.changed)
    stats.skipped = peopleGroupsWithEnglish.length - toSave.length

    sendEvent('progress', {
      phase: 'saving',
      message: `Saving ${toSave.length} of ${totalPeopleGroups} people groups...`,
      totalPeopleGroups
    })

    for (let i = 0; i < toSave.length; i++) {
      const item = toSave[i]!

      try {
        if (field.tableColumn) {
          await peopleGroupService.updatePeopleGroup(item.pg.id, {
            [fieldKey]: item.fieldValue
          } as any)
        } else {
          const metadata = item.pg.metadata || {}
          metadata[fieldKey] = item.fieldValue
          await peopleGroupService.updatePeopleGroup(item.pg.id, {
            metadata
          })
        }
        stats.translated++
      } catch (error) {
        stats.errors++
        errorDetails.push({
          peopleGroup: item.pg.name,
          error: `Save failed: ${getErrorMessage(error)}`
        })
      }

      // Send progress every 10 items
      if (i % 10 === 0 || i === toSave.length - 1) {
        sendEvent('progress', {
          phase: 'saving',
          message: `Saved ${i + 1} of ${toSave.length} people groups`,
          saved: i + 1,
          totalPeopleGroups: toSave.length
        })
      }
    }

    // Send final result
    sendEvent('complete', {
      success: stats.errors === 0,
      message: `Processed ${stats.total} people group(s): ${stats.translated} translated, ${stats.skipped} skipped, ${stats.errors} errors`,
      stats,
      errorDetails: errorDetails.length > 0 ? errorDetails.slice(0, 10) : undefined
    })

  } catch (error) {
    sendEvent('error', {
      message: getErrorMessage(error)
    })
  } finally {
    event.node.res.end()
  }
})
