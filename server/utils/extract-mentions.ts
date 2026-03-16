/**
 * Extract mentioned user IDs from Tiptap JSON content.
 * Recursively walks the document tree to find mention nodes.
 */
export function extractMentions(content: Record<string, any>): string[] {
  const userIds: Set<string> = new Set()

  function walk(node: any) {
    if (!node || typeof node !== 'object') return

    if (node.type === 'mention' && node.attrs?.id) {
      userIds.add(String(node.attrs.id))
    }

    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        walk(child)
      }
    }
  }

  walk(content)
  return Array.from(userIds)
}
