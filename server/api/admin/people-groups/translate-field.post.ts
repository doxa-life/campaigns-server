import { peopleGroupService, type PeopleGroup } from '#server/database/people-groups'
import { translateTexts, isDeepLConfigured } from '#server/utils/deepl'
import { LANGUAGES } from '~/utils/languages'
import { allFields, type FieldDefinition } from '~/utils/people-group-fields'
import { getErrorMessage } from '#server/utils/api-helpers'

interface PeopleGroupWithEnglish {
  pg: PeopleGroup
  englishText: string
  fieldValue: Record<string, string>
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

  if (!isDeepLConfigured()) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Translation service not configured. Please add DEEPL_API_KEY to environment.'
    })
  }

  const body = await readBody(event)

  if (!body.fieldKey || typeof body.fieldKey !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Field key is required'
    })
  }

  const { fieldKey, overwrite = false } = body

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
      let fieldValue: Record<string, string> | null = null

      if (field.tableColumn) {
        fieldValue = (pg as any)[fieldKey] as Record<string, string> | null
      } else {
        if (pg.metadata) {
          fieldValue = pg.metadata[fieldKey] as Record<string, string> | null
        }
      }

      const englishText = fieldValue?.en
      if (englishText && englishText.trim() !== '') {
        peopleGroupsWithEnglish.push({
          pg,
          englishText: englishText.trim(),
          fieldValue: fieldValue || {}
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
    sendEvent('progress', {
      phase: 'saving',
      message: 'Saving all translations to database...',
      totalPeopleGroups
    })

    for (let i = 0; i < peopleGroupsWithEnglish.length; i++) {
      const item = peopleGroupsWithEnglish[i]!

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
      if (i % 10 === 0 || i === peopleGroupsWithEnglish.length - 1) {
        sendEvent('progress', {
          phase: 'saving',
          message: `Saved ${i + 1} of ${totalPeopleGroups} people groups`,
          saved: i + 1,
          totalPeopleGroups
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
