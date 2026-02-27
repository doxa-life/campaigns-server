import type { Job, TranslationBatchPayload } from '../../database/job-queue'
import type { ProcessorResult } from './index'
import { libraryContentService } from '../../database/library-content'
import { batchTranslateTiptapContents, isDeepLConfigured, translateVerseNodes, type TiptapNode, type VerseWarning } from '../../utils/deepl'

/**
 * Check if a verse node has actual text content (not empty).
 */
function hasVerseContent(node: TiptapNode): boolean {
  if (node.text) return true
  if (node.content) {
    return node.content.some(child => hasVerseContent(child))
  }
  return false
}

/**
 * Walk two Tiptap trees in parallel. For each verse node:
 * - If existing target has content → copy it (preserve)
 * - If existing target is empty or missing → fetch from Bible API
 * Non-verse nodes are recursed into.
 */
async function preserveOrFetchVerses(
  translated: TiptapNode,
  existing: TiptapNode | undefined,
  targetLanguage: string,
  warnings: VerseWarning[]
): Promise<void> {
  if (!translated.content) return

  for (let i = 0; i < translated.content.length; i++) {
    const tNode = translated.content[i]!
    const eNode = existing?.content?.[i]

    if (tNode.type === 'verse') {
      if (eNode?.type === 'verse' && hasVerseContent(eNode)) {
        // Preserve existing target verse
        translated.content[i] = JSON.parse(JSON.stringify(eNode))
      } else {
        // No existing verse — fetch from Bible API
        const wrapper: TiptapNode = { type: 'doc', content: [tNode] }
        await translateVerseNodes(wrapper, targetLanguage, warnings)
      }
    } else {
      await preserveOrFetchVerses(tNode, eNode, targetLanguage, warnings)
    }
  }
}

/**
 * Walk two trees in parallel and replace verse nodes in `target` with those from `source`.
 */
function graftVerseNodes(target: TiptapNode, source: TiptapNode): void {
  if (!target.content || !source.content) return
  for (let i = 0; i < target.content.length && i < source.content.length; i++) {
    if (target.content[i]!.type === 'verse' && source.content[i]!.type === 'verse') {
      target.content[i] = source.content[i]!
    } else {
      graftVerseNodes(target.content[i]!, source.content[i]!)
    }
  }
}

export async function processBatchTranslation(job: Job): Promise<ProcessorResult> {
  const payload = job.payload as TranslationBatchPayload

  if (!isDeepLConfigured()) {
    return { success: false, data: { error: 'DeepL API key not configured' } }
  }

  // Get all source content for this library + language
  const sourceContent = await libraryContentService.getLibraryContent(payload.library_id, {
    language: payload.source_language
  })

  if (sourceContent.length === 0) {
    return { success: false, data: { error: 'No source content found' } }
  }

  // Filter to items that have content
  let contentToTranslate = sourceContent.filter(c => c.content_json)

  // Load existing target content (needed for overwrite check and verse preservation)
  const existingTarget = await libraryContentService.getLibraryContent(payload.library_id, {
    language: payload.target_language
  })
  const existingByDay = new Map(existingTarget.map(c => [c.day_number, c]))

  const existingDays = new Set(existingTarget.map(c => c.day_number))
  const retranslateVerses = payload.retranslate_verses !== false

  // Verse-only update: when not overwriting text but retranslating verses,
  // update verse nodes in existing target content without touching the text.
  let verseOnlyUpdated = 0
  const verseWarnings: VerseWarning[] = []

  if (!payload.overwrite && retranslateVerses) {
    const sourceByDay = new Map(sourceContent.map(c => [c.day_number, c]))
    const existingWithContent = existingTarget.filter(c => c.content_json)
    for (const existing of existingWithContent) {
      const source = sourceByDay.get(existing.day_number)
      if (!source?.content_json) continue
      // Clone the source (English) doc so translateVerseNodes reads English references
      const doc: TiptapNode = JSON.parse(JSON.stringify(source.content_json))
      await translateVerseNodes(doc, payload.target_language, verseWarnings)
      // Graft the translated verse nodes into the existing target doc
      const targetDoc: TiptapNode = JSON.parse(JSON.stringify(existing.content_json))
      graftVerseNodes(targetDoc, doc)
      await libraryContentService.bulkUpsertContent(payload.library_id, [{
        day_number: existing.day_number,
        language_code: payload.target_language,
        content_json: targetDoc
      }])
      verseOnlyUpdated++
    }
  }

  // If not overwriting, filter out days that already have target translations
  if (!payload.overwrite) {
    contentToTranslate = contentToTranslate.filter(c => !existingDays.has(c.day_number))
  }

  if (contentToTranslate.length === 0 && verseOnlyUpdated === 0) {
    return { success: true, data: { skipped: true, reason: 'All days already translated', target_language: payload.target_language } }
  }

  if (contentToTranslate.length === 0) {
    return {
      success: true,
      data: {
        target_language: payload.target_language,
        days_translated: 0,
        verses_updated: verseOnlyUpdated,
        total_source_days: sourceContent.length,
        verse_warnings: verseWarnings
      }
    }
  }

  // Batch translate new (non-existing) days
  const sourceDocs = contentToTranslate.map(c => c.content_json!) as TiptapNode[]
  const skipVerseTranslation = !retranslateVerses
  const { docs: translatedDocs, verseWarnings: translateVerseWarnings } = await batchTranslateTiptapContents(
    sourceDocs,
    payload.target_language,
    payload.source_language,
    { skipVerseTranslation }
  )
  verseWarnings.push(...translateVerseWarnings)

  // When skipping verse retranslation: preserve existing target verses, fetch missing ones
  if (skipVerseTranslation) {
    for (let i = 0; i < contentToTranslate.length; i++) {
      const existing = existingByDay.get(contentToTranslate[i]!.day_number)
      await preserveOrFetchVerses(
        translatedDocs[i]!,
        existing?.content_json as TiptapNode | undefined,
        payload.target_language,
        verseWarnings
      )
    }
  }

  // Bulk upsert all translated content
  const items = contentToTranslate.map((c, i) => ({
    day_number: c.day_number,
    language_code: payload.target_language,
    content_json: translatedDocs[i]!
  }))

  const { upserted } = await libraryContentService.bulkUpsertContent(payload.library_id, items)

  return {
    success: true,
    data: {
      target_language: payload.target_language,
      days_translated: upserted,
      verses_updated: verseOnlyUpdated,
      total_source_days: sourceContent.length,
      verse_warnings: verseWarnings
    }
  }
}
