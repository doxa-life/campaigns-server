// Display metadata for each version provenance key. The database stores only
// the key; the label and icon resolve here.

export type ContextVersionSource = 'user' | 'assistant' | 'api'

export const CONTEXT_VERSION_SOURCES = {
  user: { label: 'Direct edit', icon: 'i-lucide-pencil', color: 'neutral' },
  assistant: { label: 'AI assistant', icon: 'i-lucide-sparkles', color: 'primary' },
  api: { label: 'API client', icon: 'i-lucide-plug', color: 'primary' }
} as const satisfies Record<ContextVersionSource, { label: string, icon: string, color: 'neutral' | 'primary' }>
