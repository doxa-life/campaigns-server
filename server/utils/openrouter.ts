/**
 * OpenRouter Translation Client
 *
 * Translates text fragments with an LLM via the OpenRouter chat-completions
 * API. Each request carries the language's glossary and every fragment of the
 * batch, and the model must return exactly one translation per fragment so the
 * caller can map results back into structured content.
 */

import { getLanguageByCode, getLanguageName } from '~/utils/languages'
import { GLOSSARIES } from '../../config/glossaries'
import { appConfigService } from '../database/app-config'

/** app_config key holding the default OpenRouter model used for translation. */
export const TRANSLATION_MODEL_CONFIG_KEY = 'translation_model'

const DEFAULT_TRANSLATION_MODEL = 'google/gemini-3.1-pro-preview'

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'

export function isOpenRouterConfigured(): boolean {
  return !!useRuntimeConfig().openrouterApiKey
}

/**
 * The OpenRouter model used to translate into a language. A per-language
 * override in config/languages.ts wins; then the superadmin-managed app_config
 * value, the TRANSLATION_MODEL env var, and a code default — so adopting a
 * newly released model is a setting, not a code edit.
 */
export async function getTranslationModel(targetLanguage?: string): Promise<string> {
  if (targetLanguage) {
    const override = getLanguageByCode(targetLanguage)?.translationModel
    if (override) return override
  }
  const stored = await appConfigService.getConfig<string>(TRANSLATION_MODEL_CONFIG_KEY)
  if (stored) return stored
  return useRuntimeConfig().translationModel || DEFAULT_TRANSLATION_MODEL
}

/** Language name as used in prompts — the precise variant when the plain name is ambiguous. */
function promptLanguageName(code: string): string {
  return getLanguageByCode(code)?.translationName || getLanguageName(code)
}

function buildSystemPrompt(targetLanguage: string, sourceLanguage: string, fragmentCount: number): string {
  const source = promptLanguageName(sourceLanguage)
  const target = promptLanguageName(targetLanguage)

  const glossary = GLOSSARIES[targetLanguage]
  const glossaryBlock = glossary?.length
    ? `\nGlossary — always use these translations, inflected correctly for the surrounding grammar:\n${glossary.map(([s, t]) => `${s} → ${t}`).join('\n')}\n`
    : ''

  return `You are a professional translator for a Christian prayer platform. Translate daily prayer content from ${source} into ${target}.

Rules:
- Use natural, reverent ${target} in a formal register suited to printed devotional material.
- The numbered fragments are consecutive pieces of one document; formatting may split a sentence across fragments. Translate each fragment so that the concatenated result reads naturally.
- Return exactly one translation per fragment, in the same order. Never merge, split, reorder, or skip fragments, and add no commentary.
- If a fragment begins or ends with whitespace, preserve that whitespace.
- Render names of people, places, and Scripture references using standard ${target} conventions.
${glossaryBlock}
Respond with a JSON object of the form {"translations": ["...", "..."]} containing exactly ${fragmentCount} strings.`
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>
  error?: { message?: string }
}

function parseTranslations(content: string, expectedCount: number): string[] {
  // Some models wrap JSON output in a markdown code fence despite json_object mode
  const raw = content.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
  const parsed = JSON.parse(raw)
  const translations = parsed?.translations
  if (!Array.isArray(translations) || translations.length !== expectedCount || !translations.every(t => typeof t === 'string')) {
    throw new Error(`Expected ${expectedCount} translated fragments, got ${Array.isArray(translations) ? translations.length : 'invalid output'}`)
  }
  return translations
}

/**
 * Translate an array of text fragments in a single model request.
 * Returns translations in the same order as the input.
 */
export async function openrouterTranslateTexts(
  texts: string[],
  targetLanguage: string,
  sourceLanguage: string = 'en'
): Promise<string[]> {
  if (texts.length === 0) return []

  const config = useRuntimeConfig()
  const apiKey = config.openrouterApiKey

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured')
  }

  const model = await getTranslationModel(targetLanguage)

  const body = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: buildSystemPrompt(targetLanguage, sourceLanguage, texts.length) },
      { role: 'user', content: JSON.stringify({ fragments: texts }) }
    ],
    response_format: { type: 'json_object' }
  })

  console.log(`[Translate] ${model}: ${texts.length} fragments → ${targetLanguage}`)

  // The fragment-count contract occasionally fails on a first attempt; one
  // retry recovers those cases before surfacing an error to the caller.
  let lastError: Error | undefined
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'DOXA Prayer'
      },
      body
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`)
    }

    const data: ChatCompletionResponse = await response.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) {
      throw new Error(`No translation returned from OpenRouter${data.error?.message ? `: ${data.error.message}` : ''}`)
    }

    try {
      return parseTranslations(content, texts.length)
    } catch (e: any) {
      lastError = e
      console.warn(`[Translate] attempt ${attempt} failed for ${targetLanguage}: ${e?.message}`)
    }
  }

  throw new Error(`OpenRouter translation failed for "${targetLanguage}": ${lastError?.message}`)
}
