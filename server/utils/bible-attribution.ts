import { getCopyrightNotice } from '../../config/bible-copyrights'

interface TiptapNode {
  type?: string
  attrs?: Record<string, any>
  content?: TiptapNode[]
}

function collectTranslations(node: TiptapNode, result: Set<string>) {
  if (node.type === 'verse' && node.attrs?.translation) {
    result.add(node.attrs.translation)
  }
  if (node.content) {
    for (const child of node.content) {
      collectTranslations(child, result)
    }
  }
}

export function extractTranslations(contentItems: { content_json?: Record<string, any> | string | null }[]): string[] {
  const translations = new Set<string>()
  for (const item of contentItems) {
    if (!item.content_json || typeof item.content_json === 'string') continue
    collectTranslations(item.content_json as TiptapNode, translations)
  }
  return Array.from(translations)
}

export function getCopyrightNotices(translationIds: string[]): { id: string; notice: string }[] {
  const notices: { id: string; notice: string }[] = []
  for (const id of translationIds) {
    const notice = getCopyrightNotice(id)
    if (notice) {
      notices.push({ id, notice })
    }
  }
  return notices
}
