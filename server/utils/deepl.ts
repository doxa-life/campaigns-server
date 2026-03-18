/**
 * DeepL Translation Utility
 *
 * Provides translation services using the DeepL API.
 * Handles both plain text and Tiptap JSON content.
 */

import { LANGUAGE_CODES, getDeeplTargetCode, getDeeplSourceCode, getBibleId, getBibleLabel, getGlossaryId } from '~/utils/languages'
import { parseReference, localizeReference } from '../../config/bible-books'
import { fetchVerseData, isBollsBibleConfigured } from './app/bolls-bible'

// Re-export for convenience
export const SUPPORTED_LANGUAGES = LANGUAGE_CODES

export interface VerseWarning {
  reference: string
  language: string
  reason: string
}

interface DeepLTranslation {
  detected_source_language: string
  text: string
}

interface DeepLResponse {
  translations: DeepLTranslation[]
}

/**
 * Translate text using DeepL API
 */
export async function translateText(
  text: string,
  targetLanguage: string,
  sourceLanguage?: string
): Promise<string> {
  const config = useRuntimeConfig()
  const apiKey = config.deeplApiKey

  if (!apiKey) {
    throw new Error('DEEPL_API_KEY is not configured')
  }

  const targetLang = getDeeplTargetCode(targetLanguage)
  const sourceLang = sourceLanguage ? getDeeplSourceCode(sourceLanguage) : undefined

  const params = new URLSearchParams({
    text,
    target_lang: targetLang
  })

  if (sourceLang) {
    params.append('source_lang', sourceLang)
  }

  const glossaryId = getGlossaryId(targetLanguage)
  if (glossaryId) {
    params.append('glossary_id', glossaryId)
  }

  // Use quality_optimized model for best translation quality
  params.append('model_type', 'quality_optimized')

  const apiUrl = config.deeplApiUrl || 'https://api-free.deepl.com'

  console.log(`[DeepL] Translating 1 text → ${targetLang}${sourceLang ? ` from ${sourceLang}` : ''}${glossaryId ? ` (glossary: ${glossaryId})` : ''}`)

  const response = await fetch(`${apiUrl}/v2/translate`, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`DeepL API error: ${response.status} - ${errorText}`)
  }

  const data: DeepLResponse = await response.json()

  if (!data.translations || data.translations.length === 0) {
    throw new Error('No translation returned from DeepL')
  }

  return data.translations[0]!.text
}

/**
 * Translate multiple texts in a single API call (more efficient)
 */
export async function translateTexts(
  texts: string[],
  targetLanguage: string,
  sourceLanguage?: string
): Promise<string[]> {
  if (texts.length === 0) return []

  const config = useRuntimeConfig()
  const apiKey = config.deeplApiKey

  if (!apiKey) {
    throw new Error('DEEPL_API_KEY is not configured')
  }

  const targetLang = getDeeplTargetCode(targetLanguage)
  const sourceLang = sourceLanguage ? getDeeplSourceCode(sourceLanguage) : undefined

  const params = new URLSearchParams({
    target_lang: targetLang
  })

  // Add each text as a separate 'text' parameter
  for (const text of texts) {
    params.append('text', text)
  }

  if (sourceLang) {
    params.append('source_lang', sourceLang)
  }

  const glossaryId = getGlossaryId(targetLanguage)
  if (glossaryId) {
    params.append('glossary_id', glossaryId)
  }

  // Use quality_optimized model for best translation quality
  params.append('model_type', 'quality_optimized')

  const apiUrl = config.deeplApiUrl || 'https://api-free.deepl.com'

  console.log(`[DeepL] Translating ${texts.length} texts → ${targetLang}${sourceLang ? ` from ${sourceLang}` : ''}${glossaryId ? ` (glossary: ${glossaryId})` : ''}`)

  const response = await fetch(`${apiUrl}/v2/translate`, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`DeepL API error: ${response.status} - ${errorText}`)
  }

  const data: DeepLResponse = await response.json()

  if (!data.translations) {
    throw new Error('No translations returned from DeepL')
  }

  return data.translations.map(t => t.text)
}

/**
 * Interface for Tiptap JSON node
 */
export interface TiptapNode {
  type: string
  content?: TiptapNode[]
  text?: string
  marks?: any[]
  attrs?: Record<string, any>
}

/**
 * Extract all text content from Tiptap JSON, skipping specified node types.
 * Returns array of { path, text } for reconstruction.
 */
export function extractTexts(
  node: TiptapNode,
  path: number[] = [],
  skipNodeTypes: Set<string> = new Set()
): Array<{ path: number[]; text: string }> {
  const results: Array<{ path: number[]; text: string }> = []

  if (skipNodeTypes.has(node.type)) {
    return results
  }

  if (node.type === 'text' && node.text) {
    results.push({ path: [...path], text: node.text })
  }

  if (node.content && Array.isArray(node.content)) {
    node.content.forEach((child, index) => {
      results.push(...extractTexts(child, [...path, index], skipNodeTypes))
    })
  }

  return results
}

/**
 * Set text at a specific path in the Tiptap JSON tree
 */
export function setTextAtPath(node: TiptapNode, path: number[], text: string): void {
  if (path.length === 0) {
    node.text = text
    return
  }

  const [index, ...rest] = path as [number, ...number[]]
  if (node.content && node.content[index]) {
    setTextAtPath(node.content[index], rest, text)
  }
}

/**
 * Translate Tiptap JSON content
 * Preserves structure, marks, and attributes while translating text nodes.
 * Verse nodes are never sent to DeepL — they are fetched from the Bible API instead.
 */
export async function translateTiptapContent(
  contentJson: TiptapNode,
  targetLanguage: string,
  sourceLanguage?: string
): Promise<{ doc: TiptapNode; verseWarnings: VerseWarning[] }> {
  // Deep clone the content to avoid mutating the original
  const cloned: TiptapNode = JSON.parse(JSON.stringify(contentJson))

  // Extract all text nodes, skipping verse nodes entirely
  const skipNodes = new Set(['verse'])
  const textEntries = extractTexts(cloned, [], skipNodes)

  if (textEntries.length > 0) {
    const textsToTranslate = textEntries.map(e => e.text)
    const translatedTexts = await translateTexts(textsToTranslate, targetLanguage, sourceLanguage)

    textEntries.forEach((entry, i) => {
      setTextAtPath(cloned, entry.path, translatedTexts[i]!)
    })
  }

  // Handle verse nodes: fetch from Bible Brain in the target language
  const verseWarnings: VerseWarning[] = []
  await translateVerseNodes(cloned, targetLanguage, verseWarnings)

  return { doc: cloned, verseWarnings }
}

/**
 * Batch translate multiple Tiptap JSON documents in a single operation.
 * More efficient than calling translateTiptapContent() per doc because it
 * combines all text nodes across all documents into chunked DeepL API calls.
 *
 * Returns translated documents in the same order as the input.
 */
export async function batchTranslateTiptapContents(
  docs: TiptapNode[],
  targetLanguage: string,
  sourceLanguage?: string,
  options?: { skipVerseTranslation?: boolean }
): Promise<{ docs: TiptapNode[]; verseWarnings: VerseWarning[] }> {
  const skipNodes = new Set(['verse'])

  // Deep clone all docs
  const clonedDocs: TiptapNode[] = docs.map(doc => JSON.parse(JSON.stringify(doc)))

  // Extract text entries from all docs, tracking which doc each belongs to
  const allEntries: Array<{ docIndex: number; path: number[]; text: string }> = []

  for (let i = 0; i < clonedDocs.length; i++) {
    const entries = extractTexts(clonedDocs[i]!, [], skipNodes)
    for (const entry of entries) {
      allEntries.push({ docIndex: i, path: entry.path, text: entry.text })
    }
  }

  // Translate in chunks of 100
  if (allEntries.length > 0) {
    const CHUNK_SIZE = 100
    const allTranslated: string[] = []

    for (let i = 0; i < allEntries.length; i += CHUNK_SIZE) {
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 200))
      }
      const chunk = allEntries.slice(i, i + CHUNK_SIZE)
      const translated = await translateTexts(
        chunk.map(e => e.text),
        targetLanguage,
        sourceLanguage
      )
      allTranslated.push(...translated)
    }

    // Set translated texts back into cloned docs
    for (let i = 0; i < allEntries.length; i++) {
      const entry = allEntries[i]!
      setTextAtPath(clonedDocs[entry.docIndex]!, entry.path, allTranslated[i]!)
    }
  }

  // Handle verse nodes in each doc
  const verseWarnings: VerseWarning[] = []
  if (!options?.skipVerseTranslation) {
    for (const doc of clonedDocs) {
      await translateVerseNodes(doc, targetLanguage, verseWarnings)
    }
  }

  return { docs: clonedDocs, verseWarnings }
}

/**
 * Walk the Tiptap tree and replace verse node content with Bible text
 * in the target language. If fetching fails or no bibleId is configured,
 * the verse content is left untouched.
 */
export async function translateVerseNodes(node: TiptapNode, targetLanguage: string, warnings: VerseWarning[]): Promise<void> {
  if (!node.content) return

  for (const child of node.content) {
    if (child.type === 'verse') {
      const reference = child.attrs?.reference
      if (!reference) continue

      const bibleId = getBibleId(targetLanguage)
      if (!isBollsBibleConfigured(bibleId)) {
        const reason = `No Bible translation configured for "${targetLanguage}"`
        console.warn(`[Bolls Bible] ${reason}`)
        warnings.push({ reference, language: targetLanguage, reason })
        continue
      }

      const parsed = parseReference(reference)
      if (!parsed) {
        const reason = `Could not parse reference "${reference}"`
        console.warn(`[Bolls Bible] ${reason}`)
        warnings.push({ reference, language: targetLanguage, reason })
        continue
      }

      try {
        const verses = await fetchVerseData({
          bibleId: bibleId!,
          bookId: parsed.bookId,
          chapter: parsed.chapter,
          verseStart: parsed.verseStart,
          verseEnd: parsed.verseEnd
        })

        const content: any[] = []
        verses.forEach((v, i) => {
          content.push({ type: 'text', text: `${v.verse} `, marks: [{ type: 'superscript' }] })
          content.push({ type: 'text', text: i < verses.length - 1 ? v.text + ' ' : v.text })
        })
        child.content = [{
          type: 'paragraph',
          content
        }]
        child.attrs!.reference = localizeReference(parsed, 'en')
        child.attrs!.translation = getBibleLabel(targetLanguage)
      } catch (e: any) {
        const reason = e?.message || 'Unknown error'
        console.warn(`[Bolls Bible] Failed to fetch verse "${reference}" for "${targetLanguage}": ${reason}`)
        warnings.push({ reference, language: targetLanguage, reason })
      }
    } else {
      await translateVerseNodes(child, targetLanguage, warnings)
    }
  }
}

/**
 * Check if DeepL API is configured
 */
export function isDeepLConfigured(): boolean {
  const config = useRuntimeConfig()
  return !!config.deeplApiKey
}

/**
 * Get DeepL usage statistics
 */
export async function getDeepLUsage(): Promise<{ character_count: number; character_limit: number }> {
  const config = useRuntimeConfig()
  const apiKey = config.deeplApiKey

  if (!apiKey) {
    throw new Error('DEEPL_API_KEY is not configured')
  }

  const apiUrl = config.deeplApiUrl || 'https://api-free.deepl.com'

  const response = await fetch(`${apiUrl}/v2/usage`, {
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`
    }
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`DeepL API error: ${response.status} - ${errorText}`)
  }

  return await response.json()
}
